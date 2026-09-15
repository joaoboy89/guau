import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { SentryModule, SentryGlobalFilter } from "@sentry/nestjs/setup";
import { CfThrottlerGuard } from "./common/guards/cf-throttler.guard";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { OwnersModule } from "./modules/owners/owners.module";
import { WalkersModule } from "./modules/walkers/walkers.module";
import { DogsModule } from "./modules/dogs/dogs.module";
import { WalksModule } from "./modules/walks/walks.module";
import { TrackingModule } from "./modules/tracking/tracking.module";
import { ChatModule } from "./modules/chat/chat.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { AdminModule } from "./modules/admin/admin.module";
import { SupportModule } from "./modules/support/support.module";
import { WalkTypesModule } from "./modules/walk-types/walk-types.module";
import { HealthModule } from "./modules/health/health.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    DatabaseModule,
    AuthModule,
    UsersModule,
    OwnersModule,
    WalkersModule,
    DogsModule,
    WalksModule,
    TrackingModule,
    ChatModule,
    ReviewsModule,
    PaymentsModule,
    NotificationsModule,
    AdminModule,
    SupportModule,
    WalkTypesModule,
    HealthModule,
  ],
  providers: [
    // Orden que importa, y es CONTRAINTUITIVO — verificado con un harness real
    // (Test.createTestingModule + request HTTP de verdad), no solo leyendo el
    // codigo: NestJS invierte este array antes de resolver filtros
    // (RouterExceptionFilters.create() hace `filters.reverse()`), asi que el
    // ULTIMO provider declarado ES EL PRIMERO que se prueba, y gana el primero
    // cuyo @Catch() matchea.
    //
    // HttpExceptionFilter esta scopeado a @Catch(HttpException) (4xx del
    // ValidationPipe, NotFound, Conflict, etc.) y SentryGlobalFilter es
    // @Catch() (agarra cualquier cosa, sin excepcion). Por el reverse de
    // arriba, declarando SentryGlobalFilter PRIMERO acá, HttpExceptionFilter
    // termina siendo el que efectivamente se evalua primero en runtime — gana
    // para toda excepcion HTTP esperada (mismo shape de respuesta que
    // siempre, CERO cambio) y esas NUNCA llegan a SentryGlobalFilter: asi se
    // cumple "no reportar 4xx" sin inspeccionar status codes a mano. Lo que SI
    // llega a SentryGlobalFilter es exactamente lo que hoy no agarra nadie:
    // errores no manejados (bug real, Prisma, lo que sea) — esos se reportan
    // a Sentry y despues siguen el mismo fallback que ya tenian (Nest
    // devuelve un 500 generico, sin cambios de comportamiento).
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: CfThrottlerGuard },
  ],
})
export class AppModule {}
