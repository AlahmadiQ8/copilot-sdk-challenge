import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

export interface ApiError extends Error {
  statusCode?: number;
  details?: string;
}

export function errorHandler(err: ApiError, _req: Request, res: Response, _next: NextFunction) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error({ err, statusCode }, 'Request error');

  res.status(statusCode).json({
    error: message,
    ...(err.details ? { details: err.details } : {}),
  });
}

export function createError(statusCode: number, message: string, details?: string): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}
