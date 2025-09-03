import { Request, Response, NextFunction } from 'express';
import { authenticate, authenticateOptional, authorize, AuthRequest } from '../../src/middleware/auth.middleware';
import { authService } from '../../src/services/auth.service';
import { UserRole } from '../../src/models/User.model';

// Mock authService
jest.mock('../../src/services/auth.service');
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

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate valid token and attach user to request', () => {
      const mockPayload = {
        userId: 'user123',
        email: 'test@example.com',
        role: UserRole.TRAFFIC_MANAGER,
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      (authService.verifyAccessToken as jest.Mock).mockReturnValue(mockPayload);

      authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(authService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect(mockRequest.user).toEqual(mockPayload);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return 401 when no token is provided', () => {
      authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'No token provided',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when token is invalid', () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      (authService.verifyAccessToken as jest.Mock).mockReturnValue(null);

      authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid or expired token',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header is malformed', () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token',
      };

      authenticate(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'No token provided',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('authenticateOptional', () => {
    it('should attach user when valid token is provided', () => {
      const mockPayload = {
        userId: 'user123',
        email: 'test@example.com',
        role: UserRole.TRAFFIC_MANAGER,
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      (authService.verifyAccessToken as jest.Mock).mockReturnValue(mockPayload);

      authenticateOptional(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockRequest.user).toEqual(mockPayload);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without user when no token is provided', () => {
      authenticateOptional(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should continue without user when token is invalid', () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      (authService.verifyAccessToken as jest.Mock).mockReturnValue(null);

      authenticateOptional(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });

  describe('authorize', () => {
    it('should allow access for authorized role', () => {
      mockRequest.user = {
        userId: 'user123',
        email: 'test@example.com',
        role: UserRole.ADMIN,
      };

      const middleware = authorize(UserRole.ADMIN, UserRole.TRAFFIC_MANAGER);
      middleware(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should deny access for unauthorized role', () => {
      mockRequest.user = {
        userId: 'user123',
        email: 'test@example.com',
        role: UserRole.CHEF_PROJET,
      };

      const middleware = authorize(UserRole.ADMIN, UserRole.TRAFFIC_MANAGER);
      middleware(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Insufficient permissions',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', () => {
      const middleware = authorize(UserRole.ADMIN);
      middleware(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Not authenticated',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});