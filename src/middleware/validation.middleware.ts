import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import logger from '../config/logger.config';

/**
 * Validation middleware for Zod schemas
 */
export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));

        logger.debug('Validation error:', errorMessages);

        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errorMessages,
        });
        return;
      }

      logger.error('Unexpected validation error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
};