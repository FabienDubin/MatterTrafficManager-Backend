import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { errorHandler, createError, notFoundHandler } from '../../../src/middleware/error.middleware';

// Logger is already mocked globally in setup.ts

describe('Error Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      url: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-agent'),
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe('createError', () => {
    it('should create an operational error with specified status code', () => {
      const error = createError('Test error', 400);
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    it('should default to status code 500', () => {
      const error = createError('Test error');
      
      expect(error.statusCode).toBe(500);
    });
  });

  describe('errorHandler', () => {
    it('should handle generic errors', () => {
      const error = new Error('Generic error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Generic error',
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle Zod validation errors', () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['name'],
          message: 'Expected string, received number',
        },
      ]);
      
      errorHandler(zodError, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: expect.stringContaining('Validation error'),
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle MongoDB duplicate key errors', () => {
      const duplicateError = {
        code: 11000,
        message: 'Duplicate key error',
      };
      
      errorHandler(duplicateError as any, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Duplicate field value entered',
        },
        timestamp: expect.any(String),
      });
    });

    it('should include stack trace in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new Error('Test error') as any;
      error.statusCode = 400;
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      const callArgs = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(callArgs.success).toBe(false);
      expect(callArgs.error.message).toBe('Test error');
      expect(callArgs.error).toHaveProperty('stack');
      expect(callArgs.timestamp).toBeDefined();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('notFoundHandler', () => {
    it('should create 404 error for unknown routes', () => {
      mockRequest.originalUrl = '/unknown-route';
      
      notFoundHandler(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Route /unknown-route not found',
          statusCode: 404,
          isOperational: true,
        })
      );
    });
  });
});