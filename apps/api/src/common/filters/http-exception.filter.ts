import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from "@nestjs/common";
import { Request, Response } from "express";
import * as Sentry from "@sentry/nestjs";

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    // "Es HttpException" NO es sinonimo de "es un 4xx esperado" —
    // InternalServerErrorException, ServiceUnavailableException y
    // BadGatewayException son HttpException y son 5xx. Sin esto, un 500
    // deliberado cae en este filtro y NUNCA llega a SentryGlobalFilter (que
    // solo ve lo que ningun otro filtro atrapa) — se reportaria a nadie. El
    // criterio real es el status, no la clase: asi no queda desactualizado
    // el dia que Nest agregue una excepcion 5xx nueva. Sin SENTRY_DSN,
    // captureException es no-op (ver instrument.ts) — la API sigue
    // funcionando igual en local.
    if (status >= 500) {
      Sentry.captureException(exception);
    }

    const exceptionResponse = exception.getResponse();

    const error =
      typeof exceptionResponse === "string"
        ? { message: exceptionResponse }
        : (exceptionResponse as object);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...error,
    });
  }
}
