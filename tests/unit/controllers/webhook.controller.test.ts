import { Request, Response } from 'express';

// Mock Models - must be defined before mocking
const mockNotionConfig = {
  findOne: jest.fn(),
  save: jest.fn(),
  decryptWebhookToken: jest.fn(),
};

const mockSyncLog = {
  create: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  find: jest.fn(),
  aggregate: jest.fn(),
};

jest.mock('../../../src/models/NotionConfig.model', () => ({
  NotionConfigModel: mockNotionConfig
}));

jest.mock('../../../src/models/SyncLog.model', () => ({
  SyncLogModel: mockSyncLog
}));

// Mock Redis service
jest.mock('../../../src/services/redis.service', () => ({
  redisService: {
    invalidatePattern: jest.fn(),
  }
}));

import { WebhookController } from '../../../src/controllers/webhook.controller';
import { redisService } from '../../../src/services/redis.service';

describe('WebhookController', () => {
  let controller: WebhookController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    controller = new WebhookController();
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock response
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    
    mockResponse = {
      status: mockStatus,
      json: mockJson,
    };

    // Mock console methods to avoid spam in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Setup mock aggregation chains
    mockSyncLog.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([])
          })
        })
      })
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleNotionWebhook', () => {
    beforeEach(() => {
      // Setup valid webhook payload
      mockRequest = {
        body: {
          type: 'page.updated',
          data: {
            id: 'page-123',
            parent: {
              id: 'database-456'
            }
          }
        },
        headers: {}
      };

      // Mock config with databases
      mockNotionConfig.findOne.mockResolvedValue({
        isActive: true,
        databases: {
          traffic: { id: 'database-456' },
          projects: { id: 'database-789' },
          teams: { id: 'database-abc' },
          users: { id: 'database-def' },
          clients: { id: 'database-ghi' }
        }
      });
    });

    it('should handle verification token request', async () => {
      mockRequest.body = {
        verification_token: 'test-verification-token'
      };

      await controller.handleNotionWebhook(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        received: true,
        verification: true,
        message: 'Token captured. Please add it to environment variables.'
      });

      // Should not process as webhook event
      expect(redisService.invalidatePattern).not.toHaveBeenCalled();
    });

    it('should process valid webhook and invalidate cache', async () => {
      (redisService.invalidatePattern as jest.Mock).mockResolvedValue(undefined);
      mockSyncLog.create.mockResolvedValue({});

      await controller.handleNotionWebhook(mockRequest as Request, mockResponse as Response);

      // Should respond immediately
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({ received: true });

      // Should invalidate cache for Task entity (database-456 maps to traffic)
      expect(redisService.invalidatePattern).toHaveBeenCalledWith('tasks:*');
      expect(redisService.invalidatePattern).toHaveBeenCalledWith('tasks:calendar:*');
      expect(redisService.invalidatePattern).toHaveBeenCalledWith('task:page-123');

      // Should create sync log
      expect(mockSyncLog.create).toHaveBeenCalledWith({
        entityType: 'Task',
        databaseId: 'database-456',
        syncMethod: 'webhook',
        syncStatus: 'success',
        webhookEventId: expect.any(String),
        itemsProcessed: 1,
        itemsFailed: 0,
        startTime: expect.any(Date),
        endTime: expect.any(Date),
        duration: expect.any(Number),
      });
    });

    it('should handle webhook for different entity types', async () => {
      // Test Project entity
      mockRequest.body.data.parent.id = 'database-789';
      (redisService.invalidatePattern as jest.Mock).mockResolvedValue(undefined);
      mockSyncLog.create.mockResolvedValue({});

      await controller.handleNotionWebhook(mockRequest as Request, mockResponse as Response);

      expect(redisService.invalidatePattern).toHaveBeenCalledWith('projects:*');
      expect(redisService.invalidatePattern).toHaveBeenCalledWith('project:page-123');
      expect(redisService.invalidatePattern).toHaveBeenCalledWith('tasks:*'); // Related tasks

      expect(mockSyncLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Project',
          databaseId: 'database-789'
        })
      );
    });

    it('should handle webhook without database ID gracefully', async () => {
      mockRequest.body = {
        type: 'page.updated',
        data: {
          id: 'page-123'
          // No parent information
        }
      };

      await controller.handleNotionWebhook(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({ received: true });

      // Should not invalidate cache or create log
      expect(redisService.invalidatePattern).not.toHaveBeenCalled();
      expect(mockSyncLog.create).not.toHaveBeenCalled();
    });

    it('should handle unknown database ID', async () => {
      mockRequest.body.data.parent.id = 'unknown-database';
      
      await controller.handleNotionWebhook(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({ received: true });

      // Should not invalidate cache or create log
      expect(redisService.invalidatePattern).not.toHaveBeenCalled();
      expect(mockSyncLog.create).not.toHaveBeenCalled();
    });

    it('should handle cache invalidation errors gracefully', async () => {
      const cacheError = new Error('Redis connection failed');
      (redisService.invalidatePattern as jest.Mock).mockRejectedValue(cacheError);
      mockSyncLog.create.mockResolvedValue({});

      await controller.handleNotionWebhook(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({ received: true });

      // Should still create sync log even if cache fails
      expect(mockSyncLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          syncStatus: 'success'
        })
      );
    });

    it('should handle general webhook processing errors', async () => {
      const error = new Error('Database connection failed');
      mockNotionConfig.findOne.mockRejectedValue(error);
      mockSyncLog.create.mockResolvedValue({});

      await controller.handleNotionWebhook(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({ received: true });

      // The error handling should catch the error and log it
      // Verify any error was logged (exact message may vary)
      expect(console.error).toHaveBeenCalledWith('Error mapping database ID:', error);
    });

    it('should normalize database IDs correctly', async () => {
      // Test with hyphens in database ID
      mockRequest.body.data.parent.id = 'data-base-456-with-hyphens';
      
      mockNotionConfig.findOne.mockResolvedValue({
        isActive: true,
        databases: {
          traffic: { id: 'database456withhyphens' } // stored without hyphens
        }
      });

      (redisService.invalidatePattern as jest.Mock).mockResolvedValue(undefined);
      mockSyncLog.create.mockResolvedValue({});

      await controller.handleNotionWebhook(mockRequest as Request, mockResponse as Response);

      expect(redisService.invalidatePattern).toHaveBeenCalledWith('tasks:*');
      expect(mockSyncLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Task',
          databaseId: 'data-base-456-with-hyphens'
        })
      );
    });
  });

  describe('handleWebhookCapture', () => {
    beforeEach(() => {
      mockRequest = {
        body: {
          type: 'page.updated',
          data: {
            parent: {
              database_id: 'test-database-id'
            }
          }
        },
        headers: {
          'x-notion-signature': 'sha256=test-signature'
        }
      };
    });

    it('should capture webhook with signature', async () => {
      const mockConfig = {
        isActive: true,
        webhookVerificationToken: null,
        webhookCaptureMode: {},
        save: jest.fn().mockResolvedValue({})
      };

      mockNotionConfig.findOne.mockResolvedValue(mockConfig);

      await controller.handleWebhookCapture(mockRequest as Request, mockResponse as Response);

      expect(mockConfig.save).toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Webhook event captured. Please configure the verification token manually.',
        eventType: 'page.updated',
        databaseId: 'test-database-id',
      });
    });

    it('should handle webhook without signature', async () => {
      mockRequest.headers = {}; // No signature

      const mockConfig = {
        isActive: true,
        webhookVerificationToken: 'existing-token'
      };

      mockNotionConfig.findOne.mockResolvedValue(mockConfig);

      await controller.handleWebhookCapture(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Webhook received',
        eventType: 'page.updated',
      });
    });

    it('should handle no config found', async () => {
      mockNotionConfig.findOne.mockResolvedValue(null);

      await controller.handleWebhookCapture(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'No active configuration found',
        code: 'NO_CONFIG'
      });
    });

    it('should handle capture errors', async () => {
      const error = new Error('Database error');
      mockNotionConfig.findOne.mockRejectedValue(error);

      await controller.handleWebhookCapture(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Failed to capture webhook',
        code: 'CAPTURE_ERROR'
      });
    });
  });

  describe('getCaptureStatus', () => {
    it('should return capture status with config', async () => {
      const mockConfig = {
        isActive: true,
        webhookVerificationToken: 'encrypted-token',
        webhookCaptureMode: {
          enabled: true,
          enabledAt: new Date('2024-01-01'),
          capturedEvent: {
            type: 'page.updated',
            timestamp: new Date('2024-01-01')
          }
        }
      };

      mockNotionConfig.findOne.mockResolvedValue(mockConfig);

      await controller.getCaptureStatus(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith({
        captureEnabled: true,
        enabledAt: new Date('2024-01-01'),
        capturedEvent: expect.any(Object),
        webhookConfigured: true,
        status: 'configured'
      });
    });

    it('should handle no config found', async () => {
      mockNotionConfig.findOne.mockResolvedValue(null);

      await controller.getCaptureStatus(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'No configuration found',
        code: 'NO_CONFIG'
      });
    });
  });

  describe('testWebhook', () => {
    it('should handle no configuration', async () => {
      mockNotionConfig.findOne.mockResolvedValue(null);

      await controller.testWebhook(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'No configuration found',
        code: 'NO_CONFIG'
      });
    });

    it('should handle test webhook errors', async () => {
      const error = new Error('Test error');
      mockNotionConfig.findOne.mockRejectedValue(error);

      await controller.testWebhook(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Failed to test webhook',
        code: 'TEST_ERROR'
      });
    });
  });

  describe('getWebhookLogs', () => {
    beforeEach(() => {
      mockRequest = {
        query: {
          page: '1',
          limit: '20'
        }
      };
    });

    it('should get webhook logs with pagination', async () => {
      const mockLogs = [
        {
          entityType: 'Task',
          syncStatus: 'success',
          createdAt: new Date(),
          duration: 150
        }
      ];

      const mockStats = [
        { _id: 'success', count: 10, avgDuration: 150 },
        { _id: 'failed', count: 2, avgDuration: 200 }
      ];

      mockSyncLog.countDocuments.mockResolvedValue(12);
      mockSyncLog.find().sort().skip().limit().lean.mockResolvedValue(mockLogs);
      mockSyncLog.aggregate.mockResolvedValue(mockStats);

      await controller.getWebhookLogs(mockRequest as Request, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: {
          logs: mockLogs,
          pagination: {
            page: 1,
            limit: 20,
            total: 12,
            totalPages: 1
          },
          stats: {
            total: 12,
            byStatus: {
              success: { count: 10, avgDuration: 150 },
              failed: { count: 2, avgDuration: 200 }
            }
          }
        }
      });
    });

    it('should handle filters in webhook logs', async () => {
      mockRequest.query = {
        page: '1',
        limit: '10',
        entityType: 'Task',
        status: 'success',
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      };

      mockSyncLog.countDocuments.mockResolvedValue(5);
      mockSyncLog.find().sort().skip().limit().lean.mockResolvedValue([]);
      mockSyncLog.aggregate.mockResolvedValue([]);

      await controller.getWebhookLogs(mockRequest as Request, mockResponse as Response);

      // Verify that filter was applied
      expect(mockSyncLog.countDocuments).toHaveBeenCalledWith({
        syncMethod: 'webhook',
        entityType: 'Task',
        syncStatus: 'success',
        createdAt: {
          $gte: new Date('2024-01-01'),
          $lte: new Date('2024-01-31')
        }
      });

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          logs: [],
          pagination: expect.objectContaining({
            page: 1,
            limit: 10,
            total: 5
          })
        })
      });
    });

    it('should handle logs fetch errors', async () => {
      const error = new Error('Database query failed');
      mockSyncLog.countDocuments.mockRejectedValue(error);

      await controller.getWebhookLogs(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Failed to fetch webhook logs',
        code: 'LOGS_ERROR'
      });
    });
  });
});