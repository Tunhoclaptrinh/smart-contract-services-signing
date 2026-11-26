import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import {
  BaseController,
  BaseService,
  bootstrapService,
  HealthController,
  JwtAuthGuard,
  PermissionsController,
  Repository,
  RolesGuard,
} from "@sc/nest-common";

/**
 * Service template. A service repository replaces this module with its own controllers and
 * providers; the chassis (@sc/nest-common) gives it storage, CRUD, errors and startup.
 */
@Module({
  controllers: [HealthController, BaseController, PermissionsController],
  providers: [
    Repository,
    BaseService,
    // Order matters: the token sets req.user, then roles and permissions are checked.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
class ServiceModule {}

void bootstrapService({ module: ServiceModule, name: "signing", port: 3004 });
