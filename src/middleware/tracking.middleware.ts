/**
 * Middleware for tracking requests and errors
 */

import { Request, Response, NextFunction } from 'express';
import { activityTracker } from '../services/activity-tracker.service';
import type { AuthRequest } from './auth.middleware';

/**
 * Track all incoming requests
 */
export function trackRequest(req: Request, _res: Response, next: NextFunction): void {
  // Track the request
  activityTracker.trackRequest(req.path);
  next();
}

/**
 * Enhanced error handler with tracking
 */
export function trackError(err: any, req: Request, _res: Response, next: NextFunction): void {
  // Track the error
  const authReq = req as AuthRequest;
  const errorData: {
    message: string;
    statusCode: number;
    path: string;
    userId?: string;
    type?: string;
  } = {
    message: err.message || 'Unknown error',
    statusCode: err.statusCode || 500,
    path: req.path
  };
  
  // Only add userId if it exists
  if (authReq.user?.userId) {
    errorData.userId = authReq.user.userId;
  }
  
  // Only add type if it exists
  if (err.name) {
    errorData.type = err.name;
  }
  
  activityTracker.trackError(errorData);
  
  // Pass to next error handler
  next(err);
}