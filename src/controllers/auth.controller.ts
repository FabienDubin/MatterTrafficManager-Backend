import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import logger from '../config/logger.config';
import { UserRole } from '../models/User.model';
import { 
  LoginRequest, 
  RefreshTokenRequest, 
  LogoutRequest, 
  CreateUserRequest 
} from '../validators/auth.validator';

/**
 * Authentication controller handling auth-related HTTP requests
 */
export class AuthController {
  /**
   * Handle user login
   */
  async login(
    req: Request<{}, {}, LoginRequest['body']>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email, password } = req.body;

      const result = await authService.login(email, password);

      if (!result) {
        res.status(401).json({
          success: false,
          message: 'Invalid email or password',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Login controller error:', error);
      next(error);
    }
  }

  /**
   * Handle token refresh
   */
  async refreshToken(
    req: Request<{}, {}, RefreshTokenRequest['body']>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { refreshToken } = req.body;

      const tokens = await authService.refreshAccessToken(refreshToken);

      if (!tokens) {
        res.status(401).json({
          success: false,
          message: 'Invalid or expired refresh token',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: tokens,
      });
    } catch (error) {
      logger.error('Refresh token controller error:', error);
      next(error);
    }
  }

  /**
   * Handle user logout
   */
  async logout(
    req: Request<{}, {}, LogoutRequest['body']>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { refreshToken } = req.body;

      const success = await authService.logout(refreshToken);

      if (!success) {
        res.status(400).json({
          success: false,
          message: 'Invalid refresh token',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      logger.error('Logout controller error:', error);
      next(error);
    }
  }

  /**
   * Handle user creation (admin only)
   */
  async createUser(
    req: Request<{}, {}, CreateUserRequest['body']>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userData = {
        ...req.body,
        role: req.body.role as UserRole,
      };

      const user = await authService.createUser(userData);

      res.status(201).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          role: user.role,
          memberId: user.memberId,
        },
      });
    } catch (error) {
      logger.error('Create user controller error:', error);
      
      if (error instanceof Error && error.message === 'Email already exists') {
        res.status(409).json({
          success: false,
          message: 'Email already exists',
        });
        return;
      }
      
      next(error);
    }
  }

  /**
   * Get current user info (requires authentication)
   */
  async getCurrentUser(
    req: Request & { user?: any },
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // User info will be attached by auth middleware
      const user = req.user;

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Not authenticated',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      logger.error('Get current user controller error:', error);
      next(error);
    }
  }
}

export const authController = new AuthController();