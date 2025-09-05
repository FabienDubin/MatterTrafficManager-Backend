import { authService } from '../../src/services/auth.service';
import { userRepository } from '../../src/repositories/user.repository';
import { UserModel, UserRole } from '../../src/models/User.model';
import { RefreshTokenModel } from '../../src/models/RefreshToken.model';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// Mock dependencies
jest.mock('../../src/repositories/user.repository');
jest.mock('../../src/models/RefreshToken.model');
jest.mock('../../src/config/auth.config');
jest.mock('../../src/config/logger.config', () => {
  return {
    __esModule: true,
    default: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
});

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should return tokens and user data on successful login', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        role: UserRole.TRAFFIC_MANAGER,
        comparePassword: jest.fn().mockResolvedValue(true),
        resetFailedAttempts: jest.fn(),
        failedLoginAttempts: 0,
      };

      (userRepository.findByEmailWithPassword as jest.Mock).mockResolvedValue(mockUser);
      (userRepository.updateLastLogin as jest.Mock).mockResolvedValue(undefined);
      
      // Mock RefreshTokenModel.prototype.save
      const saveMock = jest.fn().mockResolvedValue({});
      RefreshTokenModel.prototype.save = saveMock;

      const result = await authService.login('test@example.com', 'password123');

      expect(result).toBeDefined();
      expect(result?.user.email).toBe('test@example.com');
      expect(result?.accessToken).toBeDefined();
      expect(result?.refreshToken).toBeDefined();
      expect(mockUser.comparePassword).toHaveBeenCalledWith('password123');
      expect(userRepository.updateLastLogin).toHaveBeenCalledWith('user123');
    });

    it('should return null for invalid email', async () => {
      (userRepository.findByEmailWithPassword as jest.Mock).mockResolvedValue(null);

      const result = await authService.login('invalid@example.com', 'password123');

      expect(result).toBeNull();
    });

    it('should return null for invalid password', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        comparePassword: jest.fn().mockResolvedValue(false),
        incrementFailedAttempts: jest.fn(),
      };

      (userRepository.findByEmailWithPassword as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.login('test@example.com', 'wrongpassword');

      expect(result).toBeNull();
      expect(mockUser.incrementFailedAttempts).toHaveBeenCalled();
    });

    it('should return null for locked account', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        lockedUntil: new Date(Date.now() + 3600000), // Locked for 1 hour
      };

      (userRepository.findByEmailWithPassword as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.login('test@example.com', 'password123');

      expect(result).toBeNull();
    });
  });

  describe('verifyAccessToken', () => {
    it('should return decoded payload for valid token', () => {
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        role: UserRole.ADMIN,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET || 'test-secret');
      const result = authService.verifyAccessToken(token);

      expect(result).toBeDefined();
      expect(result?.userId).toBe('user123');
      expect(result?.email).toBe('test@example.com');
      expect(result?.role).toBe(UserRole.ADMIN);
    });

    it('should return null for invalid token', () => {
      const result = authService.verifyAccessToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should return null for expired token', () => {
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        role: UserRole.ADMIN,
      };

      const token = jwt.sign(
        payload,
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '-1s' } // Already expired
      );

      const result = authService.verifyAccessToken(token);
      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'password123',
        role: UserRole.CHEF_PROJET,
      };

      const mockCreatedUser = {
        id: 'newuser123',
        ...userData,
      };

      (userRepository.emailExists as jest.Mock).mockResolvedValue(false);
      (userRepository.create as jest.Mock).mockResolvedValue(mockCreatedUser);

      const result = await authService.createUser(userData);

      expect(result).toBeDefined();
      expect(result.email).toBe('newuser@example.com');
      expect(userRepository.emailExists).toHaveBeenCalledWith('newuser@example.com');
      expect(userRepository.create).toHaveBeenCalledWith(userData);
    });

    it('should throw error if email already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        role: UserRole.CHEF_PROJET,
      };

      (userRepository.emailExists as jest.Mock).mockResolvedValue(true);

      await expect(authService.createUser(userData)).rejects.toThrow('Email already exists');
      expect(userRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should return true when refresh token is deleted successfully', async () => {
      (RefreshTokenModel.deleteOne as jest.Mock).mockResolvedValue({ deletedCount: 1 });

      const result = await authService.logout('valid-refresh-token');

      expect(result).toBe(true);
      expect(RefreshTokenModel.deleteOne).toHaveBeenCalledWith({ token: 'valid-refresh-token' });
    });

    it('should return false when refresh token is not found', async () => {
      (RefreshTokenModel.deleteOne as jest.Mock).mockResolvedValue({ deletedCount: 0 });

      const result = await authService.logout('invalid-refresh-token');

      expect(result).toBe(false);
    });
  });
});