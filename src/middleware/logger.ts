import { Request, Response, NextFunction } from 'express';
import { createLogger, format, transports } from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from './auth';

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [new transports.Console()],
});

/** Attaches a requestId and logs each request/response */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    const startTime = Date.now();

    authReq.ctx = {
      ...(authReq.ctx || {}),
      requestId,
      startTime,
    };

    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info('request', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
        userId: authReq.ctx?.userId,
        userAgent: req.headers['user-agent'],
        ip:
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          req.socket.remoteAddress,
      });
    });

    next();
  };
}
