import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger.error('Error occurred', error);

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    });
  }

  if (error.code === '23505') {
    // Unique constraint violation
    return res.status(409).json({
      error: 'Resource already exists',
      code: 'CONFLICT',
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
