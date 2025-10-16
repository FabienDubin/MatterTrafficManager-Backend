import { Request, Response } from 'express';
import { TaskUpdateController } from '../../../../src/controllers/tasks/task-update.controller';
import notionService from '../../../../src/services/notion.service';
import syncQueueService from '../../../../src/services/sync-queue.service';
import { redisService } from '../../../../src/services/redis.service';
import { latencyMetricsService } from '../../../../src/services/latency-metrics.service';
import { tasksConflictService } from '../../../../src/services/tasks-conflict.service';
import { conflictDetectionService } from '../../../../src/services/conflict-detection.service';

// Mock all dependencies
jest.mock('../../../../src/services/notion.service');
jest.mock('../../../../src/services/sync-queue.service');
jest.mock('../../../../src/services/redis.service');
jest.mock('../../../../src/services/latency-metrics.service');
jest.mock('../../../../src/services/tasks-conflict.service');
jest.mock('../../../../src/services/conflict-detection.service');

// Mock the validator
jest.mock('../../../../src/validators/tasks.validator', () => ({
  updateTaskSchema: {
    safeParse: jest.fn()
  },
  UpdateTaskInput: jest.fn()
}));

describe('TaskUpdateController', () => {
  let controller: TaskUpdateController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;
  let mockJson: jest.Mock;

  beforeEach(() => {
    controller = new TaskUpdateController();
    
    mockSend = jest.fn();
    mockStatus = jest.fn().mockReturnThis();
    mockJson = jest.fn();

    mockResponse = {
      status: mockStatus,
      json: mockJson,
      send: mockSend,
    };

    mockRequest = {
      params: { id: 'task-123' },
      body: {
        title: 'Updated Task',
        workPeriod: {
          startDate: '2024-01-01T09:00:00Z',
          endDate: '2024-01-01T17:00:00Z'
        }
      },
      query: {}
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('updateTask', () => {
    const { updateTaskSchema } = require('../../../../src/validators/tasks.validator');

    describe('Validation', () => {
      it('should return 400 if task ID is missing', async () => {
        mockRequest.params = {};

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Task ID is required'
        });
      });

      it('should return 400 if request body is invalid', async () => {
        updateTaskSchema.safeParse.mockReturnValue({
          success: false,
          error: {
            errors: [{ message: 'Invalid field' }]
          }
        });

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(mockStatus).toHaveBeenCalledWith(400);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid request data',
          details: [{ message: 'Invalid field' }]
        });
      });
    });

    describe('Conflict Detection', () => {
      beforeEach(() => {
        updateTaskSchema.safeParse.mockReturnValue({
          success: true,
          data: {
            title: 'Updated Task',
            expectedUpdatedAt: '2024-01-01T12:00:00Z'
          }
        });
      });

      it('should detect version conflicts in sync mode', async () => {
        const mockCurrentTask = {
          id: 'task-123',
          updatedAt: new Date('2024-01-01T13:00:00Z') // Different from expected
        };

        (notionService.getTask as jest.Mock).mockResolvedValue(mockCurrentTask);

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(mockStatus).toHaveBeenCalledWith(409);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Conflict detected',
          conflict: {
            type: 'version_mismatch',
            expected: '2024-01-01T12:00:00Z',
            current: '2024-01-01T13:00:00.000Z', // toISOString adds milliseconds
            message: 'The task has been modified since you last fetched it'
          },
          data: mockCurrentTask
        });
      });

      it('should proceed with update if no conflict detected', async () => {
        const mockCurrentTask = {
          id: 'task-123',
          updatedAt: new Date('2024-01-01T12:00:00Z') // Same as expected
        };

        const mockUpdatedTask = {
          id: 'task-123',
          title: 'Updated Task',
          updatedAt: new Date('2024-01-01T14:00:00Z')
        };

        // Set up the request body for sync mode (no async query param)
        mockRequest.body = { title: 'Updated Task' };
        mockRequest.query = {}; // Ensure it's sync mode
        
        // Mock the validator to return the simplified data (without expectedUpdatedAt)
        updateTaskSchema.safeParse.mockReturnValue({
          success: true,
          data: { title: 'Updated Task' }
        });

        (notionService.getTask as jest.Mock).mockResolvedValue(mockCurrentTask);
        (redisService.get as jest.Mock).mockResolvedValue({});
        (conflictDetectionService.detectUpdateConflictsSync as jest.Mock).mockResolvedValue([]);
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue([]);
        (notionService.updateTask as jest.Mock).mockResolvedValue(mockUpdatedTask);
        (tasksConflictService.getSyncStatus as jest.Mock).mockResolvedValue({
          synced: true,
          lastSync: new Date().toISOString()
        });

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(notionService.updateTask).toHaveBeenCalledWith('task-123', {
          title: 'Updated Task'
        });
        expect(mockStatus).toHaveBeenCalledWith(200);
      });

      it('should continue with update if conflict check fails', async () => {
        (notionService.getTask as jest.Mock).mockRejectedValue(new Error('Network error'));
        
        const mockUpdatedTask = {
          id: 'task-123',
          title: 'Updated Task',
          updatedAt: new Date()
        };

        (notionService.updateTask as jest.Mock).mockResolvedValue(mockUpdatedTask);
        (conflictDetectionService.detectUpdateConflictsSync as jest.Mock).mockResolvedValue([]);
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue([]);
        (tasksConflictService.getSyncStatus as jest.Mock).mockResolvedValue({
          synced: true,
          lastSync: new Date().toISOString()
        });

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(notionService.updateTask).toHaveBeenCalled();
        expect(mockStatus).toHaveBeenCalledWith(200);
      });
    });

    describe('Async Mode', () => {
      beforeEach(() => {
        mockRequest.query = { async: 'true' };
        updateTaskSchema.safeParse.mockReturnValue({
          success: true,
          data: {
            title: 'Updated Task',
            workPeriod: {
              startDate: '2024-01-01T09:00:00Z',
              endDate: '2024-01-01T17:00:00Z'
            }
          }
        });
      });

      it('should handle async update with conflict detection', async () => {
        const mockCachedTask = { id: 'task-123', title: 'Original Task' };
        const mockConflicts = [
          { id: 'conflict-1', type: 'overlap', description: 'Task overlap' }
        ];

        (redisService.get as jest.Mock).mockResolvedValue(mockCachedTask);
        (conflictDetectionService.detectUpdateConflictsAsync as jest.Mock).mockResolvedValue({
          conflicts: mockConflicts,
          method: 'redis-cache'
        });
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue(mockConflicts);

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(syncQueueService.queueTaskUpdate).toHaveBeenCalledWith('task-123', {
          title: 'Updated Task',
          workPeriod: {
            startDate: '2024-01-01T09:00:00Z',
            endDate: '2024-01-01T17:00:00Z'
          }
        });

        expect(tasksConflictService.saveConflicts).toHaveBeenCalledWith('task-123', mockConflicts);
        expect(redisService.invalidatePattern).toHaveBeenCalledWith('calendar:*');

        expect(mockStatus).toHaveBeenCalledWith(200);
        expect(mockJson).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              id: 'task-123',
              title: 'Updated Task',
              _pendingSync: true
            }),
            conflicts: mockConflicts,
            syncStatus: expect.objectContaining({
              synced: false,
              pending: true,
              conflicts: {
                hasConflicts: true,
                count: 1
              }
            }),
            meta: expect.objectContaining({
              mode: 'async',
              conflictDetectionMethod: 'redis-cache',
              conflictsDetected: 1
            })
          })
        );
      });

      it('should clear conflicts when none detected in async mode', async () => {
        (redisService.get as jest.Mock).mockResolvedValue({});
        (conflictDetectionService.detectUpdateConflictsAsync as jest.Mock).mockResolvedValue({
          conflicts: [],
          method: 'redis-cache'
        });
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue([]);

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(tasksConflictService.resolveConflictsForTask).toHaveBeenCalledWith('task-123');
        expect(mockStatus).toHaveBeenCalledWith(200);
      });

      it('should record latency metrics in async mode', async () => {
        (redisService.get as jest.Mock).mockResolvedValue({});
        (conflictDetectionService.detectUpdateConflictsAsync as jest.Mock).mockResolvedValue({
          conflicts: [],
          method: 'redis-cache'
        });
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue([]);

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(latencyMetricsService.recordRedisLatency).toHaveBeenCalledWith(
          expect.any(Number),
          'task-update-queue'
        );
      });
    });

    describe('Sync Mode', () => {
      beforeEach(() => {
        updateTaskSchema.safeParse.mockReturnValue({
          success: true,
          data: {
            title: 'Updated Task',
            workPeriod: {
              startDate: '2024-01-01T09:00:00Z',
              endDate: '2024-01-01T17:00:00Z'
            }
          }
        });
      });

      it('should handle sync update with conflict detection', async () => {
        const mockCachedTask = { id: 'task-123', title: 'Original Task' };
        const mockUpdatedTask = {
          id: 'task-123',
          title: 'Updated Task',
          updatedAt: new Date('2024-01-01T15:00:00Z')
        };
        const mockConflicts = [
          { id: 'conflict-1', type: 'resource', description: 'Resource conflict' }
        ];

        (redisService.get as jest.Mock).mockResolvedValue(mockCachedTask);
        (conflictDetectionService.detectUpdateConflictsSync as jest.Mock).mockResolvedValue(mockConflicts);
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue(mockConflicts);
        (notionService.updateTask as jest.Mock).mockResolvedValue(mockUpdatedTask);
        (tasksConflictService.getSyncStatus as jest.Mock).mockResolvedValue({
          synced: true,
          lastSync: new Date().toISOString()
        });

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(conflictDetectionService.detectUpdateConflictsSync).toHaveBeenCalledWith(
          'task-123',
          expect.objectContaining({ title: 'Updated Task' }),
          mockCachedTask
        );

        expect(notionService.updateTask).toHaveBeenCalledWith('task-123', {
          title: 'Updated Task',
          workPeriod: {
            startDate: '2024-01-01T09:00:00Z',
            endDate: '2024-01-01T17:00:00Z'
          }
        });

        expect(tasksConflictService.saveConflicts).toHaveBeenCalledWith('task-123', mockConflicts);
        expect(redisService.set).toHaveBeenCalledWith('task:task-123', mockUpdatedTask, 'task');
        expect(redisService.invalidatePattern).toHaveBeenCalledWith('calendar:*');

        expect(latencyMetricsService.recordNotionLatency).toHaveBeenCalledWith(
          expect.any(Number),
          'task-update-sync'
        );

        expect(mockStatus).toHaveBeenCalledWith(200);
        expect(mockJson).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.objectContaining({
              id: 'task-123',
              title: 'Updated Task',
              updatedAt: mockUpdatedTask.updatedAt.toISOString()
            }),
            conflicts: mockConflicts,
            meta: expect.objectContaining({
              mode: 'sync'
            })
          })
        );
      });

      it('should clear conflicts when workPeriod updated but no conflicts detected', async () => {
        const mockUpdatedTask = {
          id: 'task-123',
          title: 'Updated Task',
          updatedAt: new Date()
        };

        (redisService.get as jest.Mock).mockResolvedValue({});
        (conflictDetectionService.detectUpdateConflictsSync as jest.Mock).mockResolvedValue([]);
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue([]);
        (notionService.updateTask as jest.Mock).mockResolvedValue(mockUpdatedTask);
        (tasksConflictService.getSyncStatus as jest.Mock).mockResolvedValue({
          synced: true,
          lastSync: new Date().toISOString()
        });

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(tasksConflictService.resolveConflictsForTask).toHaveBeenCalledWith('task-123');
      });
    });

    describe('Error Handling', () => {
      beforeEach(() => {
        updateTaskSchema.safeParse.mockReturnValue({
          success: true,
          data: { title: 'Updated Task' }
        });
      });

      it('should handle task not found error', async () => {
        (redisService.get as jest.Mock).mockResolvedValue({});
        (conflictDetectionService.detectUpdateConflictsSync as jest.Mock).mockResolvedValue([]);
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue([]);
        (notionService.updateTask as jest.Mock).mockRejectedValue(new Error('Task not found'));

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(mockStatus).toHaveBeenCalledWith(404);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Task not found'
        });
      });

      it('should handle rate limit error', async () => {
        (redisService.get as jest.Mock).mockResolvedValue({});
        (conflictDetectionService.detectUpdateConflictsSync as jest.Mock).mockResolvedValue([]);
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue([]);
        (notionService.updateTask as jest.Mock).mockRejectedValue(new Error('rate limit exceeded'));

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(mockStatus).toHaveBeenCalledWith(429);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Rate limit exceeded. Please try again later.'
        });
      });

      it('should handle generic errors', async () => {
        (redisService.get as jest.Mock).mockResolvedValue({});
        (conflictDetectionService.detectUpdateConflictsSync as jest.Mock).mockResolvedValue([]);
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue([]);
        (notionService.updateTask as jest.Mock).mockRejectedValue(new Error('Generic error'));

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Failed to update task'
        });
      });

      it('should handle non-Error exceptions', async () => {
        (redisService.get as jest.Mock).mockResolvedValue({});
        (conflictDetectionService.detectUpdateConflictsSync as jest.Mock).mockResolvedValue([]);
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue([]);
        (notionService.updateTask as jest.Mock).mockRejectedValue('String error');

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(mockStatus).toHaveBeenCalledWith(500);
        expect(mockJson).toHaveBeenCalledWith({
          success: false,
          error: 'Failed to update task'
        });
      });
    });

    describe('Cache Management', () => {
      beforeEach(() => {
        updateTaskSchema.safeParse.mockReturnValue({
          success: true,
          data: {
            title: 'Updated Task',
            workPeriod: {
              startDate: '2024-01-01T09:00:00Z',
              endDate: '2024-01-01T17:00:00Z'
            }
          }
        });
      });

      it('should invalidate calendar cache when workPeriod is updated', async () => {
        const mockUpdatedTask = {
          id: 'task-123',
          title: 'Updated Task',
          updatedAt: new Date()
        };

        (redisService.get as jest.Mock).mockResolvedValue({});
        (conflictDetectionService.detectUpdateConflictsSync as jest.Mock).mockResolvedValue([]);
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue([]);
        (notionService.updateTask as jest.Mock).mockResolvedValue(mockUpdatedTask);
        (tasksConflictService.getSyncStatus as jest.Mock).mockResolvedValue({
          synced: true,
          lastSync: new Date().toISOString()
        });

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(redisService.invalidatePattern).toHaveBeenCalledWith('calendar:*');
      });

      it('should not invalidate calendar cache when workPeriod is not updated', async () => {
        updateTaskSchema.safeParse.mockReturnValue({
          success: true,
          data: { title: 'Updated Task' } // No workPeriod
        });

        const mockUpdatedTask = {
          id: 'task-123',
          title: 'Updated Task',
          updatedAt: new Date()
        };

        (redisService.get as jest.Mock).mockResolvedValue({});
        (conflictDetectionService.detectUpdateConflictsSync as jest.Mock).mockResolvedValue([]);
        (tasksConflictService.enrichConflictsWithMemberNames as jest.Mock).mockResolvedValue([]);
        (notionService.updateTask as jest.Mock).mockResolvedValue(mockUpdatedTask);
        (tasksConflictService.getSyncStatus as jest.Mock).mockResolvedValue({
          synced: true,
          lastSync: new Date().toISOString()
        });

        await controller.updateTask(mockRequest as Request, mockResponse as Response);

        expect(redisService.invalidatePattern).not.toHaveBeenCalled();
      });
    });
  });
});