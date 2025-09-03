import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { UserRole } from '../models/User.model';
import logger from '../config/logger.config';

/**
 * Extended Request interface with user property
 */
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

/**
 * Middleware to authenticate JWT tokens
 */
export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'No token provided',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = authService.verifyAccessToken(token);

    if (!decoded) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
      return;
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
    });
  }
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export function authenticateOptional(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user info
      next();
      return;
    }

    const token = authHeader.substring(7);
    const decoded = authService.verifyAccessToken(token);

    if (decoded) {
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      };
    }

    next();
  } catch (error) {
    logger.error('Optional authentication middleware error:', error);
    // Continue without user info
    next();
  }
}

/**
 * Middleware to authorize based on user roles
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Unauthorized access attempt by ${req.user.email} to ${req.path}`);
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to check if user is admin
 */
export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  authorize(UserRole.ADMIN)(req, res, next);
}

/**
 * Middleware to check if user is admin or traffic manager
 */
export function requireManagerOrAbove(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  authorize(UserRole.ADMIN, UserRole.TRAFFIC_MANAGER)(req, res, next);
}