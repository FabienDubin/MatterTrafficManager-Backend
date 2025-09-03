import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { IUserDocument, UserRole } from '../models/User.model';
import { RefreshTokenModel, IRefreshTokenDocument } from '../models/RefreshToken.model';
import { userRepository } from '../repositories/user.repository';
import { authConfig } from '../config/auth.config';
import logger from '../config/logger.config';

/**
 * JWT payload interface
 */
export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
}

/**
 * Authentication tokens interface
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Login result interface
 */
export interface LoginResult extends AuthTokens {
  user: {
    id: string;
    email: string;
    role: UserRole;
    memberId?: string;
  };
}

/**
 * Authentication service for handling JWT tokens and user authentication
 */
export class AuthService {
  /**
   * Authenticate user with email and password
   */
  async login(email: string, password: string): Promise<LoginResult | null> {
    try {
      // Find user by email with password
      const user = await userRepository.findByEmailWithPassword(email);
      
      if (!user) {
        logger.warn(`Login attempt failed: user not found for email ${email}`);
        return null;
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        logger.warn(`Login attempt on locked account: ${email}`);
        return null;
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      
      if (!isPasswordValid) {
        logger.warn(`Login attempt failed: invalid password for ${email}`);
        await user.incrementFailedAttempts();
        return null;
      }

      // Reset failed attempts on successful login
      if (user.failedLoginAttempts && user.failedLoginAttempts > 0) {
        await user.resetFailedAttempts();
      }

      // Update last login
      await userRepository.updateLastLogin(user.id);

      // Generate tokens
      const tokens = await this.generateTokens(user);

      logger.info(`User logged in successfully: ${email}`);

      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          ...(user.memberId && { memberId: user.memberId }),
        },
      };
    } catch (error) {
      logger.error('Error during login:', error);
      throw error;
    }
  }

  /**
   * Generate access and refresh tokens for a user
   */
  async generateTokens(user: IUserDocument): Promise<AuthTokens> {
    try {
      // Create JWT payload
      const payload: JWTPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      // Generate access token
      const accessToken = jwt.sign(
        payload, 
        authConfig.jwt.secret, 
        { expiresIn: authConfig.jwt.accessExpiry } as jwt.SignOptions
      );

      // Generate refresh token with family ID for rotation
      const refreshTokenValue = crypto.randomBytes(32).toString('hex');
      const family = crypto.randomBytes(16).toString('hex');

      // Calculate expiry date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      // Save refresh token to database
      const refreshTokenDoc = new RefreshTokenModel({
        token: refreshTokenValue,
        userId: user.id,
        family,
        expiresAt,
      });

      await refreshTokenDoc.save();

      return {
        accessToken,
        refreshToken: refreshTokenValue,
      };
    } catch (error) {
      logger.error('Error generating tokens:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthTokens | null> {
    try {
      // Find refresh token in database
      const tokenDoc = await RefreshTokenModel.findOne({
        token: refreshToken,
        expiresAt: { $gt: new Date() },
      });

      if (!tokenDoc) {
        logger.warn('Refresh token not found or expired');
        return null;
      }

      // Find user
      const user = await userRepository.findById(tokenDoc.userId);
      
      if (!user) {
        logger.error(`User not found for refresh token: ${tokenDoc.userId}`);
        await RefreshTokenModel.deleteOne({ token: refreshToken });
        return null;
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        logger.warn(`Token refresh attempt on locked account: ${user.email}`);
        await RefreshTokenModel.deleteOne({ token: refreshToken });
        return null;
      }

      // Delete old refresh token (rotation)
      await RefreshTokenModel.deleteOne({ token: refreshToken });

      // Delete all tokens from the same family (security measure)
      await RefreshTokenModel.deleteMany({ 
        userId: tokenDoc.userId, 
        family: tokenDoc.family 
      });

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      logger.info(`Tokens refreshed for user: ${user.email}`);

      return tokens;
    } catch (error) {
      logger.error('Error refreshing access token:', error);
      throw error;
    }
  }

  /**
   * Logout user by invalidating refresh token
   */
  async logout(refreshToken: string): Promise<boolean> {
    try {
      const result = await RefreshTokenModel.deleteOne({ token: refreshToken });
      
      if (result.deletedCount > 0) {
        logger.info('User logged out successfully');
        return true;
      }
      
      logger.warn('Logout attempt with invalid refresh token');
      return false;
    } catch (error) {
      logger.error('Error during logout:', error);
      throw error;
    }
  }

  /**
   * Verify JWT access token
   */
  verifyAccessToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, authConfig.jwt.secret) as JWTPayload;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('Access token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid access token');
      } else {
        logger.error('Error verifying access token:', error);
      }
      return null;
    }
  }

  /**
   * Create a new user
   */
  async createUser(userData: {
    email: string;
    password: string;
    role: UserRole;
    memberId?: string | undefined;
  }): Promise<IUserDocument> {
    try {
      // Check if email already exists
      const exists = await userRepository.emailExists(userData.email);
      
      if (exists) {
        throw new Error('Email already exists');
      }

      // Create user
      const userToCreate = {
        email: userData.email,
        password: userData.password,
        role: userData.role,
        ...(userData.memberId && { memberId: userData.memberId }),
      };
      const user = await userRepository.create(userToCreate);
      logger.info(`New user created: ${user.email}`);
      
      return user;
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Invalidate all refresh tokens for a user
   */
  async invalidateAllUserTokens(userId: string): Promise<void> {
    try {
      await RefreshTokenModel.deleteMany({ userId });
      logger.info(`All tokens invalidated for user: ${userId}`);
    } catch (error) {
      logger.error('Error invalidating user tokens:', error);
      throw error;
    }
  }
}

export const authService = new AuthService();