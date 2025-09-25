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
          firstName: user.firstName,
          lastName: user.lastName,
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

  /**
   * Get all users (admin only)
   */
  async getAllUsers(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string | undefined;

      const result = await authService.getAllUsers(page, limit, search);

      res.status(200).json({
        success: true,
        data: result.users,
        meta: {
          total: result.total,
          pages: result.pages,
          page,
          limit,
        },
      });
    } catch (error) {
      logger.error('Get all users controller error:', error);
      next(error);
    }
  }

  /**
   * Update user (admin only)
   */
  async updateUser(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const user = await authService.updateUser(id, updateData);

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          memberId: user.memberId,
        },
      });
    } catch (error) {
      logger.error('Update user controller error:', error);
      
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
   * Delete user (admin only)
   */
  async deleteUser(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const success = await authService.deleteUser(id);

      if (!success) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      logger.error('Delete user controller error:', error);
      next(error);
    }
  }

  /**
   * Reset user password (admin only)
   */
  async resetPassword(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const newPassword = await authService.resetPassword(id);

      res.status(200).json({
        success: true,
        message: 'Password reset successfully',
        data: {
          temporaryPassword: newPassword,
          note: 'User must change password on next login',
        },
      });
    } catch (error) {
      logger.error('Reset password controller error:', error);
      
      if (error instanceof Error && error.message === 'User not found') {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }
      
      next(error);
    }
  }
}

export const authController = new AuthController();