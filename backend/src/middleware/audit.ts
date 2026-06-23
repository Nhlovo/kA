import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export async function auditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const originalSend = res.send;
  let responseData: any;

  res.send = function (data) {
    responseData = data;
    return originalSend.call(this, data);
  };

  const startTime = Date.now();
  const userId = (req as any).userId;
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Log critical actions
    if (
      req.method !== 'GET' ||
      statusCode >= 400 ||
      req.path.includes('/release') ||
      req.path.includes('/finance')
    ) {
      try {
        await query(
          `
          INSERT INTO audit_logs 
          (user_id, event_type, action, ip_address, browser_info, success)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
          [
            userId || null,
            req.method,
            `${req.method} ${req.path}`,
            ipAddress,
            userAgent,
            statusCode < 400,
          ]
        );
      } catch (error) {
        logger.error('Failed to log audit entry', error);
      }
    }
  });

  next();
}
