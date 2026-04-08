import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { type Response } from 'express';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';

export function extractMessage(res: string | object): string | null {
  if (typeof res === 'string') {
    return res;
  }

  if ('message' in res) {
    return res.message as string;
  }

  return null;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<AuthenticatedRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = extractMessage(res) ?? message;
      stack = exception.stack;
      // If the exception has a cause (e.g. from InternalServerErrorException), use that stack if available
      if (exception.cause instanceof Error) {
        stack = exception.cause.stack;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      stack = exception.stack;
    }

    const errorLog = {
      status,
      method: request.method,
      path: request.url,
      message,
      meta: this.getDefaultMetaFromRequest(request),
      stack,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(errorLog);
    } else {
      this.logger.warn(errorLog);
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private getDefaultMetaFromRequest(request: AuthenticatedRequest): Record<string, unknown> {
    const meta: Record<string, unknown> = {};

    if (request?.user) {
      meta.userId = request.user.id;
      meta.email = request.user.email;
    }

    meta.targetUserId = meta.targetUserId ?? request?.params?.userId;
    meta.notificationId = meta.notificationId ?? request?.params?.notificationId;

    return meta;
  }
}
