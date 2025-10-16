import { Request, Response } from 'express';
import { TaskCreateController } from '../../../../src/controllers/tasks/task-create.controller';

// Mock all services
jest.mock('../../../../src/services/notion.service', () => ({
  __esModule: true,
  default: {
    createTask: jest.fn(),
  }
}));

jest.mock('../../../../src/services/sync-queue.service', () => ({
  __esModule: true,
  default: {
    queueTaskCreate: jest.fn(),
  }
}));

jest.mock('../../../../src/services/redis.service', () => ({
  redisService: {
    set: jest.fn(),
    invalidatePattern: jest.fn(),
  }
}));

jest.mock('../../../../src/services/latency-metrics.service', () => ({
  latencyMetricsService: {
    recordRedisLatency: jest.fn(),
    recordNotionLatency: jest.fn(),
  }
}));

jest.mock('../../../../src/services/tasks-conflict.service', () => ({
  tasksConflictService: {
    saveConflicts: jest.fn(),
    getSyncStatus: jest.fn(),
  }
}));

jest.mock('../../../../src/services/conflict-detection.service', () => ({
  conflictDetectionService: {
    detectCreateConflicts: jest.fn(),
  }
}));

// Import mocked services
import notionService from '../../../../src/services/notion.service';
import syncQueueService from '../../../../src/services/sync-queue.service';
import { redisService } from '../../../../src/services/redis.service';
import { latencyMetricsService } from '../../../../src/services/latency-metrics.service';
import { tasksConflictService } from '../../../../src/services/tasks-conflict.service';
import { conflictDetectionService } from '../../../../src/services/conflict-detection.service';

describe('TaskCreateController', () => {
  let controller: TaskCreateController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    controller = new TaskCreateController();
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock response
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    
    mockResponse = {
      status: mockStatus,
      json: mockJson,
    };

    // Mock console.error to avoid spam in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createTask - Sync Mode', () => {
    beforeEach(() => {
      mockRequest = {
        body: {
          title: 'Test Task',
          workPeriod: {
            startDate: '2024-01-01T09:00:00.000Z',
            endDate: '2024-01-01T17:00:00.000Z'
          },
          assignedMembers: ['member-1'],
          projectId: 'project-1',
          taskType: 'task',
          status: 'not_started'
        },
        query: {} // sync mode by default
      };
    });

    it('should create task successfully with valid payload', async () => {
      const mockCreatedTask = {
        id: 'task-123',
        title: 'Test Task',
        workPeriod: {
          startDate: '2024-01-01T09:00:00.000Z',
          endDate: '2024-01-01T17:00:00.000Z'
        },
        assignedMembers: ['member-1'],
        projectId: 'project-1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockSyncStatus = {
        synced: true,
        lastSync: new Date().toISOString(),
        conflicts: { hasConflicts: false },
        pending: false
      };

      // Mock service responses
      (conflictDetectionService.detectCreateConflicts as jest.Mock).mockResolvedValue([]);
      (notionService.createTask as jest.Mock).mockResolvedValue(mockCreatedTask);
      (redisService.set as jest.Mock).mockResolvedValue(undefined);
      (redisService.invalidatePattern as jest.Mock).mockResolvedValue(undefined);
      (tasksConflictService.getSyncStatus as jest.Mock).mockResolvedValue(mockSyncStatus);

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      // Verify service calls
      expect(conflictDetectionService.detectCreateConflicts).toHaveBeenCalledWith(mockRequest.body);
      expect(notionService.createTask).toHaveBeenCalledWith(mockRequest.body);
      expect(redisService.set).toHaveBeenCalledWith(
        `task:${mockCreatedTask.id}`,
        mockCreatedTask,
        'task'
      );
      expect(redisService.invalidatePattern).toHaveBeenCalledWith('calendar:*');
      expect(tasksConflictService.getSyncStatus).toHaveBeenCalledWith(mockCreatedTask.id, 'task');

      // Verify response
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          ...mockCreatedTask,
          updatedAt: mockCreatedTask.updatedAt.toISOString()
        }),
        syncStatus: mockSyncStatus,
        conflicts: [],
        meta: expect.objectContaining({
          cached: true,
          mode: 'sync'
        })
      });
    });

    it('should handle validation errors gracefully', async () => {
      mockRequest.body = {
        title: '', // Invalid empty title
        workPeriod: {
          startDate: 'invalid-date'
        }
      };

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid request data',
        details: expect.any(Array)
      });

      // Verify no service calls were made
      expect(notionService.createTask).not.toHaveBeenCalled();
    });

    it('should save conflicts when detected', async () => {
      const mockConflicts = [
        {
          type: 'scheduling',
          message: 'Overlapping task detected',
          conflictingTaskId: 'other-task-id'
        }
      ];

      const mockCreatedTask = {
        id: 'task-123',
        title: 'Test Task',
        updatedAt: new Date()
      };

      (conflictDetectionService.detectCreateConflicts as jest.Mock).mockResolvedValue(mockConflicts);
      (notionService.createTask as jest.Mock).mockResolvedValue(mockCreatedTask);
      (redisService.set as jest.Mock).mockResolvedValue(undefined);
      (redisService.invalidatePattern as jest.Mock).mockResolvedValue(undefined);
      (tasksConflictService.saveConflicts as jest.Mock).mockResolvedValue(undefined);
      (tasksConflictService.getSyncStatus as jest.Mock).mockResolvedValue({
        synced: true,
        conflicts: { hasConflicts: true }
      });

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(tasksConflictService.saveConflicts).toHaveBeenCalledWith(
        mockCreatedTask.id,
        mockConflicts
      );

      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          conflicts: mockConflicts
        })
      );
    });

    it('should handle rate limit errors', async () => {
      const rateError = new Error('rate limit exceeded');
      (conflictDetectionService.detectCreateConflicts as jest.Mock).mockResolvedValue([]);
      (notionService.createTask as jest.Mock).mockRejectedValue(rateError);

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(429);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Rate limit exceeded. Please try again later.'
      });
    });

    it('should handle general errors gracefully', async () => {
      const generalError = new Error('Database connection failed');
      (conflictDetectionService.detectCreateConflicts as jest.Mock).mockRejectedValue(generalError);

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create task'
      });
    });
  });

  describe('createTask - Async Mode', () => {
    beforeEach(() => {
      mockRequest = {
        body: {
          title: 'Test Task',
          workPeriod: {
            startDate: '2024-01-01T09:00:00.000Z',
            endDate: '2024-01-01T17:00:00.000Z'
          },
          assignedMembers: ['member-1']
        },
        query: { async: 'true' } // async mode
      };
    });

    it('should queue task creation for async processing', async () => {
      const mockTempId = 'temp-123';
      (syncQueueService.queueTaskCreate as jest.Mock).mockResolvedValue({ id: mockTempId });
      (redisService.invalidatePattern as jest.Mock).mockResolvedValue(undefined);

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(syncQueueService.queueTaskCreate).toHaveBeenCalledWith(mockRequest.body);
      expect(redisService.invalidatePattern).toHaveBeenCalledWith('calendar:*');
      expect(latencyMetricsService.recordRedisLatency).toHaveBeenCalledWith(
        expect.any(Number),
        'task-create-queue'
      );

      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: mockTempId,
          title: 'Test Task',
          _temporary: true,
          _pendingSync: true
        }),
        syncStatus: {
          synced: false,
          lastSync: expect.any(String),
          conflicts: { hasConflicts: false },
          pending: true
        },
        meta: expect.objectContaining({
          cached: true,
          mode: 'async',
          tempId: mockTempId
        })
      });

      // Verify Notion service was NOT called in async mode
      expect(notionService.createTask).not.toHaveBeenCalled();
    });

    it('should complete async mode successfully with workPeriod', async () => {
      // Test that async mode works correctly with workPeriod (normal case)
      const mockTempId = 'temp-123';
      (syncQueueService.queueTaskCreate as jest.Mock).mockResolvedValue({ id: mockTempId });
      (redisService.invalidatePattern as jest.Mock).mockResolvedValue(undefined);

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(syncQueueService.queueTaskCreate).toHaveBeenCalledWith(mockRequest.body);
      expect(redisService.invalidatePattern).toHaveBeenCalledWith('calendar:*');
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: mockTempId,
            _temporary: true,
            _pendingSync: true
          }),
          meta: expect.objectContaining({
            mode: 'async'
          })
        })
      );
    });

    it('should handle async queue errors', async () => {
      const queueError = new Error('Queue service unavailable');
      (syncQueueService.queueTaskCreate as jest.Mock).mockRejectedValue(queueError);

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create task'
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing required fields', async () => {
      mockRequest = {
        body: {
          // Missing title and workPeriod
          assignedMembers: ['member-1']
        },
        query: {}
      };

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid request data',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: expect.arrayContaining(['title'])
          }),
          expect.objectContaining({
            path: expect.arrayContaining(['workPeriod'])
          })
        ])
      });
    });

    it('should handle invalid date formats', async () => {
      mockRequest = {
        body: {
          title: 'Test Task',
          workPeriod: {
            startDate: 'not-a-date',
            endDate: '2024-13-40T25:00:00.000Z' // Invalid date
          }
        },
        query: {}
      };

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid request data',
        details: expect.any(Array)
      });
    });

    it('should handle invalid task type enum', async () => {
      mockRequest = {
        body: {
          title: 'Test Task',
          workPeriod: {
            startDate: '2024-01-01T09:00:00.000Z',
            endDate: '2024-01-01T17:00:00.000Z'
          },
          taskType: 'invalid-type' // Not in enum
        },
        query: {}
      };

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid request data',
        details: expect.any(Array)
      });
    });
  });

  describe('Cache and Metrics Integration', () => {
    beforeEach(() => {
      mockRequest = {
        body: {
          title: 'Test Task',
          workPeriod: {
            startDate: '2024-01-01T09:00:00.000Z',
            endDate: '2024-01-01T17:00:00.000Z'
          }
        },
        query: {}
      };
    });

    it('should record metrics for sync mode', async () => {
      const mockCreatedTask = {
        id: 'task-123',
        title: 'Test Task',
        updatedAt: new Date()
      };

      (conflictDetectionService.detectCreateConflicts as jest.Mock).mockResolvedValue([]);
      (notionService.createTask as jest.Mock).mockResolvedValue(mockCreatedTask);
      (redisService.set as jest.Mock).mockResolvedValue(undefined);
      (tasksConflictService.getSyncStatus as jest.Mock).mockResolvedValue({
        synced: true,
        conflicts: { hasConflicts: false }
      });

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(latencyMetricsService.recordNotionLatency).toHaveBeenCalledWith(
        expect.any(Number),
        'task-create-sync'
      );
    });

    it('should cache created task with correct key', async () => {
      const mockCreatedTask = {
        id: 'task-123',
        title: 'Test Task',
        updatedAt: new Date()
      };

      (conflictDetectionService.detectCreateConflicts as jest.Mock).mockResolvedValue([]);
      (notionService.createTask as jest.Mock).mockResolvedValue(mockCreatedTask);
      (redisService.set as jest.Mock).mockResolvedValue(undefined);
      (tasksConflictService.getSyncStatus as jest.Mock).mockResolvedValue({
        synced: true,
        conflicts: { hasConflicts: false }
      });

      await controller.createTask(mockRequest as Request, mockResponse as Response);

      expect(redisService.set).toHaveBeenCalledWith(
        'task:task-123',
        mockCreatedTask,
        'task'
      );
    });
  });
});