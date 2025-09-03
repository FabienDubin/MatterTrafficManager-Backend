import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../config/logger.config';

/**
 * Custom error interface for application errors
 */
export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Create operational error
 */
export const createError = (message: string, statusCode: number = 500): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};

/**
 * Global error handler middleware
 * Centralizes error handling with structured logging
 */
export const errorHandler = (
  err: AppError | ZodError | Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let error = { ...err } as AppError;
  error.message = err.message;

  // Zod validation errors
  if (err instanceof ZodError) {
    const message = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    error = createError(`Validation error: ${message}`, 400);
  }

  // Mongoose duplicate key error
  if ((err as any).code === 11000) {
    const message = 'Duplicate field value entered';
    error = createError(message, 400);
  }

  // Mongoose validation error
  if ((err as any).name === 'ValidationError') {
    const message = Object.values((err as any).errors).map((val: any) => val.message).join(', ');
    error = createError(`Validation error: ${message}`, 400);
  }

  // Log error with context
  logger.error('Application error', {
    message: error.message,
    statusCode: error.statusCode || 500,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Send error response
  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    },
    timestamp: new Date().toISOString()
  });
};

/**
 * 404 handler for unknown routes
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = createError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};