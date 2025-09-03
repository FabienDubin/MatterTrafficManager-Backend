import request from 'supertest';
import express from 'express';
import notionRouter from '../../../src/routes/notion.route';
import notionService from '../../../src/services/notion.service';
import { authService } from '../../../src/services/auth.service';
import { NotionAPIError } from '../../../src/errors/NotionAPIError';

// Mock dependencies
jest.mock('../../../src/services/notion.service');
jest.mock('../../../src/services/auth.service');
jest.mock('../../../src/config/logger.config', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Notion Routes Integration Tests', () => {
  let app: express.Application;
  let validToken: string;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/notion', notionRouter);

    validToken = 'Bearer valid-jwt-token';

    // Mock authentication
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      userId: 'user123',
      email: 'test@example.com',
      role: 'admin'
    });

    jest.clearAllMocks();
  });

  describe('GET /api/v1/notion/test', () => {
    it('should validate all databases successfully', async () => {
      const mockValidation = {
        success: true,
        databases: {
          traffic: { accessible: true, count: 10 },
          users: { accessible: true, count: 5 },
          projects: { accessible: true, count: 3 },
          clients: { accessible: true, count: 2 },
          teams: { accessible: true, count: 1 }
        }
      };

      (notionService.validateAllDatabases as jest.Mock).mockResolvedValueOnce(mockValidation);

      const response = await request(app)
        .get('/api/v1/notion/test')
        .set('Authorization', validToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('All Notion databases are accessible');
      expect(response.body.databases).toEqual(mockValidation.databases);
    });

    it('should handle partial database failures', async () => {
      const mockValidation = {
        success: false,
        databases: {
          traffic: { accessible: true, count: 10 },
          users: { accessible: false, error: 'Access denied' },
          projects: { accessible: true, count: 3 },
          clients: { accessible: true, count: 2 },
          teams: { accessible: true, count: 1 }
        }
      };

      (notionService.validateAllDatabases as jest.Mock).mockResolvedValueOnce(mockValidation);

      const response = await request(app)
        .get('/api/v1/notion/test')
        .set('Authorization', validToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Some databases are not accessible');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/notion/test');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/notion/test-crud', () => {
    it('should perform CRUD operations successfully', async () => {
      const mockTask = {
        id: 'task123',
        title: 'Test Task',
        workPeriod: { startDate: new Date(), endDate: new Date() },
        assignedMembers: [],
        projectId: null,
        taskType: 'task',
        status: 'not_started',
        notes: 'Test notes',
        billedHours: 8,
        actualHours: 0,
        addToCalendar: false,
        googleEventId: null,
        clientPlanning: false,
        client: null,
        team: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      (notionService.createTask as jest.Mock).mockResolvedValueOnce(mockTask);
      (notionService.getTask as jest.Mock).mockResolvedValueOnce({
        ...mockTask,
        assignedMembers: [],
        projectId: null
      });
      (notionService.updateTask as jest.Mock).mockResolvedValueOnce({
        ...mockTask,
        title: 'Updated Test Task',
        status: 'in_progress',
        actualHours: 2
      });
      (notionService.archiveTask as jest.Mock).mockResolvedValueOnce(undefined);

      const response = await request(app)
        .post('/api/v1/notion/test-crud')
        .set('Authorization', validToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('CRUD operations completed successfully');
      expect(response.body.results.create.success).toBe(true);
      expect(response.body.results.read.success).toBe(true);
      expect(response.body.results.update.success).toBe(true);
      expect(response.body.results.delete.success).toBe(true);
    });

    it('should handle CRUD operation failures', async () => {
      const error = new NotionAPIError('Creation failed', 'CREATE_ERROR', 400);
      (notionService.createTask as jest.Mock).mockRejectedValueOnce(error);

      const response = await request(app)
        .post('/api/v1/notion/test-crud')
        .set('Authorization', validToken);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('CRUD test failed');
      expect(response.body.results.create.success).toBe(false);
    });
  });

  describe('GET /api/v1/notion/test-rate-limit', () => {
    it('should test rate limiting successfully', async () => {
      const mockResult = {
        success: true,
        timeTaken: 3500,
        errors: 0
      };

      (notionService.testRateLimit as jest.Mock).mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/notion/test-rate-limit')
        .set('Authorization', validToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Rate limiting is working correctly');
      expect(response.body.details.totalRequests).toBe(10);
      expect(response.body.details.timeTaken).toBe(3500);
      expect(response.body.details.errors).toBe(0);
    });

    it('should handle rate limit test failures', async () => {
      const mockResult = {
        success: false,
        timeTaken: 2000,
        errors: 5
      };

      (notionService.testRateLimit as jest.Mock).mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/api/v1/notion/test-rate-limit')
        .set('Authorization', validToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Rate limit test encountered errors');
      expect(response.body.details.errors).toBe(5);
    });
  });

  describe('GET /api/v1/notion/test-relations', () => {
    it('should validate bidirectional relations', async () => {
      const mockTrafficData = {
        results: [{
          id: 'task1',
          title: 'Task 1',
          assignedMembers: ['user1'],
          projectId: 'project1',
          client: 'Client A',
          team: 'Team B'
        }]
      };

      const mockUsersData = {
        results: [{
          id: 'user1',
          name: 'User 1',
          tasks: ['task1', 'task2']
        }]
      };

      const mockProjectsData = {
        results: [{
          id: 'project1',
          name: 'Project 1',
          tasks: ['task1']
        }]
      };

      (notionService.queryTrafficDatabase as jest.Mock).mockResolvedValueOnce(mockTrafficData);
      (notionService.queryUsersDatabase as jest.Mock).mockResolvedValueOnce(mockUsersData);
      (notionService.queryProjectsDatabase as jest.Mock).mockResolvedValueOnce(mockProjectsData);

      const response = await request(app)
        .get('/api/v1/notion/test-relations')
        .set('Authorization', validToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Bidirectional relations validated');
      expect(response.body.relations).toBeDefined();
      expect(response.body.summary.tasksWithUsers).toBe(1);
      expect(response.body.summary.tasksWithProjects).toBe(1);
    });
  });

  describe('GET /api/v1/notion/test-filters', () => {
    it('should test filters and complex queries', async () => {
      const mockProjects = {
        results: [
          { id: 'p1', name: 'Active Project', status: 'En cours' }
        ]
      };

      const mockTasks = {
        results: [
          { id: 't1', title: 'This Week Task' },
          { id: 't2', title: 'Another Task' }
        ]
      };

      const mockCompletedTasks = {
        results: [
          { id: 't3', title: 'Completed Task', status: 'completed' }
        ]
      };

      (notionService.queryProjectsDatabase as jest.Mock).mockResolvedValueOnce(mockProjects);
      (notionService.queryTasksWithFilters as jest.Mock)
        .mockResolvedValueOnce(mockTasks)
        .mockResolvedValueOnce(mockCompletedTasks);

      const response = await request(app)
        .get('/api/v1/notion/test-filters')
        .set('Authorization', validToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Filters and complex queries tested successfully');
      expect(response.body.results.projectsInProgress.count).toBe(1);
      expect(response.body.results.tasksThisWeek.count).toBe(2);
      expect(response.body.results.completedTasks.count).toBe(1);
    });
  });

  describe('GET /api/v1/notion/test-mappings', () => {
    it('should validate property ID mappings', async () => {
      const mockTask = {
        id: 'task1',
        title: 'Test Task',
        workPeriod: { startDate: new Date(), endDate: new Date() },
        assignedMembers: ['user1'],
        projectId: 'project1',
        taskType: 'task',
        status: 'in_progress',
        notes: 'Notes',
        billedHours: 8,
        actualHours: 4,
        addToCalendar: true,
        googleEventId: 'event1',
        clientPlanning: false,
        client: 'Client A',
        team: 'Team B',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      (notionService.queryTrafficDatabase as jest.Mock).mockResolvedValueOnce({
        results: [mockTask]
      });

      const response = await request(app)
        .get('/api/v1/notion/test-mappings')
        .set('Authorization', validToken);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Property ID mappings validated successfully');
      expect(response.body.mappingValidation).toBeDefined();
      expect(response.body.sampleTask).toEqual(mockTask);
    });

    it('should handle no tasks found', async () => {
      (notionService.queryTrafficDatabase as jest.Mock).mockResolvedValueOnce({
        results: []
      });

      const response = await request(app)
        .get('/api/v1/notion/test-mappings')
        .set('Authorization', validToken);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('No tasks found to test mappings');
    });
  });

  describe('Error Handling', () => {
    it('should handle NotionAPIError properly', async () => {
      const error = new NotionAPIError(
        'Rate limit exceeded',
        'RATE_LIMIT_EXCEEDED',
        429
      );

      (notionService.validateAllDatabases as jest.Mock).mockRejectedValueOnce(error);

      const response = await request(app)
        .get('/api/v1/notion/test')
        .set('Authorization', validToken);

      expect(response.status).toBe(500);
    });

    it('should handle generic errors', async () => {
      const error = new Error('Generic error');
      
      (notionService.validateAllDatabases as jest.Mock).mockRejectedValueOnce(error);

      const response = await request(app)
        .get('/api/v1/notion/test')
        .set('Authorization', validToken);

      expect(response.status).toBe(500);
    });
  });
});