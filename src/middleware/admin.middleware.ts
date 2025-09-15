import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to check if user has admin role
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }
    
    // Check if user has admin role
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
      return;
    }
    
    next();
  } catch (error) {
    console.error('Error in admin middleware:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

/**
 * Middleware to check if user has super admin role
 */
export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }
    
    // Check if user has super admin role
    if (user.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        error: 'Super admin access required'
      });
      return;
    }
    
    next();
  } catch (error) {
    console.error('Error in super admin middleware:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};