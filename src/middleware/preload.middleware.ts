/**
 * Middleware for intelligent cache preloading based on routes
 */

import { Request, Response, NextFunction } from 'express';
import { preloadService } from '../services/preload.service';
import logger from '../config/logger.config';

/**
 * Middleware to trigger preloading based on the requested route
 */
export const preloadMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  // Extract the base route (remove /api/v1 prefix and any params)
  const path = req.path.replace(/^\/api\/v\d+/, '').split('?')[0];
  
  // Don't block the request, preload in background
  if (path && path !== '/health' && !path.startsWith('/auth')) {
    preloadService.preloadForRoute(path).catch(err => {
      logger.debug('Background preload error (non-blocking):', err);
    });
  }
  
  next();
};