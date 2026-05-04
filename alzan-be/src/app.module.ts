import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import serverConfig from './config/server.config';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { ResponseSerializerInterceptor } from './core/interceptors/response-serializer.interceptor';
import { createLoggerConfig } from './config/logger.config';
import { createValidationPipe } from './core/pipes/validation.pipe';
import { AuthGuard } from './core/guards/auth.guard';
import { validateEnv } from './config/validate-env';
import supabaseConfig from './config/supabase.config';
import { ComponentsModule } from './components/components.modules';
import { SupabaseModule } from './core/supabase/supabase.module';

export const appRootImports = [
  ConfigModule.forRoot({
    isGlobal: true,
    validate: validateEnv,
    load: [serverConfig, supabaseConfig],
  }),
  LoggerModule.forRoot(createLoggerConfig()),
  SupabaseModule,
];

@Module({
  imports: [...appRootImports, ComponentsModule],
  controllers: [AppController],
  providers: [
    AppService,
    // global authentication
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    // global exceptions
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    // global validation
    {
      provide: APP_PIPE,
      useFactory: createValidationPipe,
    },
    // global serialization
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseSerializerInterceptor,
    },
  ],
})
export class AppModule {}
