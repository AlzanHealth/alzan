import { createGcpLoggingPinoConfig } from '@google-cloud/pino-logging-gcp-config';
import { Params } from 'nestjs-pino';
import { NodeEnvironment } from '../common/enum/config.enum';

export const createLoggerConfig = (): Params => {
  const isLocal = process.env.NODE_ENV === NodeEnvironment.LOCAL;
  return {
    pinoHttp: {
      ...(isLocal
        ? {
            level: 'debug',

            transport: {
              target: 'pino-pretty',
              options: {
                sync: true,
                colorize: true,
                singleLine: true,
                levelFirst: false,
                ignore: 'pid,hostname',
                translateTime: 'yyyy-mm-dd"T"HH:MM:ss.l',
              },
            },
          }
        : createGcpLoggingPinoConfig({}, { level: 'info' })),
      serializers: {
        // Whitelist fields: OAuth parameters, cookies, webhook secrets and health
        // payloads must never enter automatic request logs.
        req: (req: { id?: string | number; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url?.split(/[?#]/u)[0],
        }),
        ...(isLocal
          ? {
              res: (res: { statusCode: number }) => `${res.statusCode}`,
              err: (err: Error): { message: string; stack?: string } => ({
                message: err.message,
                stack: err.stack?.split('\n').slice(0, 3).join('\n'),
              }),
            }
          : {}),
      },
      redact: [
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        'req.headers.cookie',
        'req.headers.secret',
        'req.headers.client_secret',
        'req.headers["client-secret"]',
        'req.query.token',
        'req.query.code',
        'res.headers["set-cookie"]',
      ],
    },
  };
};
