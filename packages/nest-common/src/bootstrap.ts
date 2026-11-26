import "reflect-metadata";
import {
  BadRequestException,
  PayloadTooLargeException,
  type INestApplication,
  type Type,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { config as loadEnv } from "dotenv";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { auditContext } from "./audit-events";
import { AuditReadsInterceptor } from "./audit-http";
import { AllExceptionsFilter } from "./filters/all-exceptions.filter";
import { LoggingInterceptor } from "./interceptors/logging.interceptor";
import { TransformInterceptor } from "./interceptors/transform.interceptor";
import { repoRoot } from "./paths";
import { createValidationPipe } from "./problem";
import { Repository } from "./repository";
import { BaseService } from "./services/base.service";
import { createBus } from "./bus";
import { OutboxRelay } from "./outbox";
import type { ServiceName } from "./events";

export interface ServiceOptions {
  /** The service's root module; it must provide Repository and BaseService. */
  module: Type<unknown>;
  /** Shown in Swagger and in /health. */
  name: string;
  /** Default port when PORT and API_PORT are unset. */
  port?: number;
  /** Runs after storage is ready and before the service listens (seed data, warm caches). */
  beforeListen?: (app: INestApplication) => Promise<void>;
}

/**
 * Starts a service the same way everywhere (the microservice chassis): .env from the repository
 * root, `/api/v1` prefix, request id and audit context, one error format, response envelope, read
 * audit, Swagger at `/api/docs`, storage initialised before the first request.
 */
export async function bootstrapService(options: ServiceOptions) {
  process.env.REPO_ROOT ??= repoRoot();
  loadEnv({ path: resolve(process.env.REPO_ROOT, ".env"), quiet: true });
  process.env.SERVICE_NAME ??= options.name;
  process.chdir(process.env.REPO_ROOT);

  const app = await NestFactory.create<NestExpressApplication>(options.module);
  app.useBodyParser("json", { limit: "4mb" });
  // Normalize parser errors before Nest maps SyntaxError to its implementation message.
  app.use(
    (
      error: { type?: string },
      _req: Request,
      _res: Response,
      next: NextFunction,
    ) => {
      if (error.type === "entity.parse.failed")
        return next(new BadRequestException("INVALID_JSON"));
      if (error.type === "entity.too.large")
        return next(new PayloadTooLargeException("PAYLOAD_TOO_LARGE"));
      next(error);
    },
  );
  await app.get(Repository).init();
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(",") : true,
  });
  app.use(
    (
      req: Request & { requestId?: string },
      res: Response,
      next: () => void,
    ) => {
      if (req.path === "/healthz") {
        res.status(200).send("ok\n");
        return;
      }
      // A request id given by the gateway is kept, so one id follows the call across services.
      req.requestId = req.header("x-request-id") ?? randomUUID();
      res.setHeader("x-request-id", req.requestId);
      auditContext.run(
        { requestId: req.requestId, method: req.method, path: req.path },
        next,
      );
    },
  );
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(app.get(Repository)));
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
    new AuditReadsInterceptor(app.get(Repository), app.get(BaseService)),
  );
  await options.beforeListen?.(app);
  SwaggerModule.setup(
    "api/docs",
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(options.name)
        .setVersion("1.0")
        .addBearerAuth()
        .build(),
    ),
  );
  // Outbox relay: on when BUS_URL is set (OUTBOX_RELAY=false turns it off).
  if (process.env.BUS_URL && process.env.OUTBOX_RELAY !== "false") {
    const bus = createBus();
    const relay = new OutboxRelay(
      app.get(Repository),
      bus,
      options.name as ServiceName,
    );
    relay.start();
    process.once("SIGTERM", () => {
      relay.stop();
      void bus.close();
    });
  }
  app.enableShutdownHooks();
  // Cloud PaaS (Render, Koyeb, Railway, Cloud Run) supply PORT and expect 0.0.0.0.
  const port = Number(
    process.env.PORT ?? process.env.API_PORT ?? options.port ?? 3000,
  );
  const host =
    process.env.API_HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
  await app.listen(port, host);
  return app;
}
