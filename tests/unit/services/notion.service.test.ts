import notionService from '../../../src/services/notion.service';
import * as rateLimiter from '../../../src/services/rateLimiter.service';
import * as retryWithBackoff from '../../../src/utils/retryWithBackoff';
import { NotionAPIError } from '../../../src/errors/NotionAPIError';
import { notion } from '../../../src/config/notion.config';
import * as notionMapper from '../../../src/mappers/notion.mapper';

jest.mock('../../../src/config/notion.config');
jest.mock('../../../src/services/rateLimiter.service');
jest.mock('../../../src/utils/retryWithBackoff');
jest.mock('../../../src/mappers/notion.mapper');
jest.mock('../../../src/config/logger.config', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('NotionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    (rateLimiter.throttledNotionCall as jest.Mock).mockImplementation(
      (fn) => fn()
    );
    
    (retryWithBackoff.retryWithBackoff as jest.Mock).mockImplementation(
      (fn) => fn()
    );
  });

  describe('testConnection', () => {
    it('should return true when connection is successful', async () => {
      (notion.users.list as jest.Mock).mockResolvedValueOnce({
        results: [{ id: 'user1' }]
      });

      const result = await notionService.testConnection();

      expect(result).toBe(true);
      expect(notion.users.list).toHaveBeenCalledWith({ page_size: 1 });
    });

    it('should throw NotionAPIError when connection fails', async () => {
      const error = { status: 401, message: 'Unauthorized' };
      (notion.users.list as jest.Mock).mockRejectedValueOnce(error);

      await expect(notionService.testConnection()).rejects.toThrow(NotionAPIError);
    });
  });

  describe('queryTrafficDatabase', () => {
    it('should return traffic tasks with pagination', async () => {
      const mockResponse = {
        results: [
          {
            id: 'task1',
            properties: {
              title: { title: [{ plain_text: 'Test Task' }] },
              '%40WIV': { date: { start: '2024-01-01', end: '2024-01-02' } },
              '%60wMW': { relation: [] },
              'pE%7Bw': { relation: [] },
              'Zq%40f': { select: null },
              'fMMJ': { select: { name: 'not_started' } },
              'kszE': { rich_text: [] },
              'wDUP': { number: null },
              'SmAG': { number: null },
              '%3F%3B%5Ce': { checkbox: false },
              'Ylnb': { rich_text: [] },
              '%5C%5Cb%3F': { checkbox: false },
              'caFD': { rich_text: [] },
              'TJ%7CG': { rich_text: [] }
            },
            created_time: '2024-01-01T00:00:00Z',
            last_edited_time: '2024-01-01T00:00:00Z'
          }
        ],
        has_more: false,
        next_cursor: null
      };

      const mockTask = {
        id: 'task1',
        title: 'Test Task',
        workPeriod: { startDate: '2024-01-01', endDate: '2024-01-02' },
        assignedTo: [],
        projects: [],
        trafficManagerChoice: null,
        status: 'not_started',
        createdTime: '2024-01-01T00:00:00Z',
        lastEditedTime: '2024-01-01T00:00:00Z'
      };

      (notion.databases.query as jest.Mock).mockResolvedValueOnce(mockResponse);
      (notionMapper.notionPageToTask as jest.Mock).mockReturnValue(mockTask);

      const result = await notionService.queryTrafficDatabase();

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('Test Task');
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should handle pagination cursor', async () => {
      const mockResponse = {
        results: [],
        has_more: true,
        next_cursor: 'cursor123'
      };

      (notion.databases.query as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await notionService.queryTrafficDatabase('prev-cursor', 50);

      expect((notion.databases.query as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({
          page_size: 50,
          start_cursor: 'prev-cursor'
        })
      );
      expect(result.nextCursor).toBe('cursor123');
    });
  });

  describe('createTask', () => {
    it('should create a task successfully', async () => {
      const input = {
        title: 'New Task',
        workPeriod: {
          startDate: '2024-01-01',
          endDate: '2024-01-02'
        },
        status: 'not_started' as const,
        taskType: 'task' as const
      };

      const mockCreatedPage = {
        id: 'task123',
        properties: {
          title: { title: [{ plain_text: 'New Task' }] },
          '%40WIV': { date: { start: '2024-01-01', end: '2024-01-02' } },
          '%60wMW': { relation: [] },
          'pE%7Bw': { relation: [] },
          'Zq%40f': { select: { name: 'task' } },
          'fMMJ': { select: { name: 'not_started' } },
          'kszE': { rich_text: [] },
          'wDUP': { number: null },
          'SmAG': { number: null },
          '%3F%3B%5Ce': { checkbox: false },
          'Ylnb': { rich_text: [] },
          '%5C%5Cb%3F': { checkbox: false },
          'caFD': { rich_text: [] },
          'TJ%7CG': { rich_text: [] }
        },
        created_time: '2024-01-01T00:00:00Z',
        last_edited_time: '2024-01-01T00:00:00Z'
      };

      const mockTask = {
        id: 'task123',
        title: 'New Task',
        workPeriod: { startDate: '2024-01-01', endDate: '2024-01-02' },
        taskType: 'task',
        status: 'not_started',
        createdTime: '2024-01-01T00:00:00Z',
        lastEditedTime: '2024-01-01T00:00:00Z'
      };

      (notion.pages.create as jest.Mock).mockResolvedValueOnce(mockCreatedPage);
      (notionMapper.notionPageToTask as jest.Mock).mockReturnValue(mockTask);
      (notionMapper.createNotionTaskProperties as jest.Mock).mockReturnValue({
        title: { title: [{ text: { content: 'New Task' } }] },
        '%40WIV': { date: { start: '2024-01-01', end: '2024-01-02' } },
        'fMMJ': { select: { name: 'not_started' } },
        'Zq%40f': { select: { name: 'task' } }
      });

      const result = await notionService.createTask(input);

      expect(result.id).toBe('task123');
      expect(result.title).toBe('New Task');
      expect((notion.pages.create as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({
          parent: expect.any(Object),
          properties: expect.any(Object)
        })
      );
    });

    it('should handle creation errors', async () => {
      const input = {
        title: 'New Task',
        workPeriod: {
          startDate: '2024-01-01',
          endDate: '2024-01-02'
        }
      };

      const error = { status: 400, message: 'Bad request' };
      (notion.pages.create as jest.Mock).mockRejectedValueOnce(error);

      await expect(notionService.createTask(input)).rejects.toThrow(NotionAPIError);
    });
  });

  describe('updateTask', () => {
    it('should update a task successfully', async () => {
      const taskId = 'task123';
      const input = {
        title: 'Updated Task',
        status: 'completed' as const
      };

      const mockUpdatedPage = {
        id: taskId,
        properties: {
          title: { title: [{ plain_text: 'Updated Task' }] },
          '%40WIV': { date: null },
          '%60wMW': { relation: [] },
          'pE%7Bw': { relation: [] },
          'Zq%40f': { select: null },
          'fMMJ': { select: { name: 'completed' } },
          'kszE': { rich_text: [] },
          'wDUP': { number: null },
          'SmAG': { number: null },
          '%3F%3B%5Ce': { checkbox: false },
          'Ylnb': { rich_text: [] },
          '%5C%5Cb%3F': { checkbox: false },
          'caFD': { rich_text: [] },
          'TJ%7CG': { rich_text: [] }
        },
        created_time: '2024-01-01T00:00:00Z',
        last_edited_time: '2024-01-01T00:00:00Z'
      };

      const mockTask = {
        id: taskId,
        title: 'Updated Task',
        status: 'completed',
        createdTime: '2024-01-01T00:00:00Z',
        lastEditedTime: '2024-01-01T00:00:00Z'
      };

      (notion.pages.update as jest.Mock).mockResolvedValueOnce(mockUpdatedPage);
      (notionMapper.notionPageToTask as jest.Mock).mockReturnValue(mockTask);
      (notionMapper.createNotionTaskProperties as jest.Mock).mockReturnValue({
        title: { title: [{ text: { content: 'Updated Task' } }] },
        'fMMJ': { select: { name: 'completed' } }
      });

      const result = await notionService.updateTask(taskId, input);

      expect(result.title).toBe('Updated Task');
      expect(result.status).toBe('completed');
      expect((notion.pages.update as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({
          page_id: taskId,
          properties: expect.any(Object)
        })
      );
    });
  });

  describe('archiveTask', () => {
    it('should archive a task successfully', async () => {
      const taskId = 'task123';
      (notion.pages.update as jest.Mock).mockResolvedValueOnce({});

      await notionService.archiveTask(taskId);

      expect((notion.pages.update as jest.Mock)).toHaveBeenCalledWith({
        page_id: taskId,
        archived: true
      });
    });
  });

  describe('testRateLimit', () => {
    it('should test rate limiting successfully', async () => {
      (notion.users.list as jest.Mock).mockResolvedValue({
        results: [{ id: 'user1' }]
      });

      (rateLimiter.batchNotionCalls as jest.Mock).mockResolvedValueOnce(
        Array(10).fill({ results: [] })
      );

      const result = await notionService.testRateLimit();

      expect(result.success).toBe(true);
      expect(result.errors).toBe(0);
      expect(result.timeTaken).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateAllDatabases', () => {
    it('should validate all databases successfully', async () => {
      (notion.databases.query as jest.Mock).mockResolvedValue({
        results: [{ id: 'item1' }]
      });

      const result = await notionService.validateAllDatabases();

      expect(result.success).toBe(true);
      expect(result.databases.traffic.accessible).toBe(true);
      expect(result.databases.users.accessible).toBe(true);
      expect(result.databases.projects.accessible).toBe(true);
      expect(result.databases.clients.accessible).toBe(true);
      expect(result.databases.teams.accessible).toBe(true);
    });

    it('should handle database validation failures', async () => {
      (notion.databases.query as jest.Mock)
        .mockResolvedValueOnce({ results: [] })
        .mockRejectedValueOnce(new Error('Access denied'))
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      const result = await notionService.validateAllDatabases();

      expect(result.success).toBe(false);
      expect(result.databases.users.accessible).toBe(false);
      expect(result.databases.users.error).toBe('Access denied');
    });
  });
});