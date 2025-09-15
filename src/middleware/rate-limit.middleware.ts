import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

/**
 * Simple in-memory rate limiter middleware
 */
export const rateLimiter = (options: RateLimitOptions) => {
  const { windowMs, max, message = 'Too many requests, please try again later.' } = options;
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    
    // Clean up expired entries
    Object.keys(store).forEach(k => {
      const entry = store[k];
      if (entry && entry.resetTime < now) {
        delete store[k];
      }
    });
    
    if (!store[key]) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs
      };
      next();
      return;
    }
    
    if (store[key].resetTime < now) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs
      };
      next();
      return;
    }
    
    store[key].count++;
    
    if (store[key].count > max) {
      const retryAfter = Math.ceil((store[key].resetTime - now) / 1000);
      
      res.status(429).json({
        success: false,
        error: message,
        retryAfter: `${retryAfter} seconds`
      });
      return;
    }
    
    next();
  };
};

/**
 * Rate limiter specifically for API endpoints
 */
export const apiRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many API requests from this IP, please try again later.'
});

/**
 * Rate limiter for authentication endpoints
 */
export const authRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.'
});

/**
 * Rate limiter for Notion test endpoints
 */
export const notionTestRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 tests per minute
  message: 'Too many Notion test requests, please try again later.'
});