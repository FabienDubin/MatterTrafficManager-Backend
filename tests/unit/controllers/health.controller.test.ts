import { Request, Response, NextFunction } from 'express';
import { HealthController } from '../../../src/controllers/health.controller';
import { healthService } from '../../../src/services/health.service';

// Mock the health service
jest.mock('../../../src/services/health.service', () => ({
  healthService: {
    getSystemHealth: jest.fn(),
  },
}));

describe('HealthController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('getHealth', () => {
    it('should return health status with 200 status code', async () => {
      const mockHealthData = {
        status: 'OK',
        message: 'Matter Traffic Backend is operational',
        timestamp: '2025-01-09T10:00:00.000Z',
        systemInfo: {
          uptime: '3600s',
          memory: {
            used: '128MB',
            total: '8192MB',
          },
          nodeVersion: 'v20.0.0',
        },
        database: {
          status: 'connected',
          connected: true,
        },
      };

      (healthService.getSystemHealth as jest.Mock).mockResolvedValue(mockHealthData);

      await HealthController.getHealth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(healthService.getSystemHealth).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(mockHealthData);
    });

    it('should handle service errors', async () => {
      const mockError = new Error('Health service error');
      (healthService.getSystemHealth as jest.Mock).mockRejectedValue(mockError);

      await HealthController.getHealth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
    });

    it('should log health check requests', async () => {
      const mockHealthData = {
        status: 'OK',
        timestamp: '2025-01-09T10:00:00.000Z',
      };

      (healthService.getSystemHealth as jest.Mock).mockResolvedValue(mockHealthData);

      await HealthController.getHealth(mockRequest as Request, mockResponse as Response, mockNext);

      // Logger should be called with health check info
      const logger = require('../../../src/config/logger.config').default;
      expect(logger.info).toHaveBeenCalledWith('Health check requested', {
        timestamp: mockHealthData.timestamp,
        status: mockHealthData.status,
      });
    });
  });
});