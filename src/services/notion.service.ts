import { notion, DATABASES } from '../config/notion.config';
import { retryWithBackoff } from '../utils/retryWithBackoff';
import { NotionAPIError } from '../errors/NotionAPIError';
import logger from '../config/logger.config';

// Import specialized services
import { taskService } from './notion/task.service';
import { calendarService } from './notion/calendar.service';
import { entityService } from './notion/entity.service';
import { cacheManagerService } from './notion/cache-manager.service';
import { BatchResolverService } from './batch-resolver.service';
import { redisService } from './redis.service';

// Import types
import type {
  NotionTask,
  NotionMember,
  NotionProject,
  NotionClient,
  NotionTeam,
  DatabaseQueryResult,
  CreateTaskInput,
  UpdateTaskInput,
} from '../types/notion.types';

/**
 * Main Notion Service - Orchestrator
 * Delegates to specialized services while maintaining backward compatibility
 */
class NotionService {
  private batchResolver: BatchResolverService;

  constructor() {
    this.batchResolver = new BatchResolverService(redisService, this);
  }

  // ============= CONNECTION & HEALTH =============

  async testConnection(): Promise<boolean> {
    try {
      await retryWithBackoff(
        async () => {
          const response = await notion.databases.retrieve({
            database_id: DATABASES.traffic,
          });
          return response;
        },
        3,
        1000,
        'testConnection'
      );

      logger.info('Notion connection test successful');
      return true;
    } catch (error) {
      logger.error('Notion connection test failed', error);
      throw NotionAPIError.fromError(error);
    }
  }

  async testRateLimit(): Promise<{ success: boolean; timeTaken: number; errors: number }> {
    const startTime = Date.now();
    let errors = 0;
    const requests = 10;

    try {
      const calls = Array(requests)
        .fill(null)
        .map(() =>
          this.testConnection().catch(() => {
            errors++;
            return false;
          })
        );

      await Promise.all(calls);

      const timeTaken = Date.now() - startTime;
      const success = errors === 0;

      logger.info('Rate limit test completed', {
        requests,
        errors,
        timeTaken,
        avgPerRequest: timeTaken / requests,
      });

      return { success, timeTaken, errors };
    } catch (error) {
      logger.error('Rate limit test failed', error);
      return {
        success: false,
        timeTaken: Date.now() - startTime,
        errors: requests,
      };
    }
  }

  async validateAllDatabases(): Promise<{
    valid: boolean;
    databases: Record<string, { exists: boolean; error?: string }>;
  }> {
    const results: Record<string, { exists: boolean; error?: string }> = {};

    for (const [name, id] of Object.entries(DATABASES)) {
      try {
        await notion.databases.retrieve({ database_id: id });
        results[name] = { exists: true };
      } catch (error: any) {
        results[name] = {
          exists: false,
          error: error.message || 'Unknown error',
        };
      }
    }

    const valid = Object.values(results).every(r => r.exists);

    logger.info('Database validation completed', { valid, results });

    return { valid, databases: results };
  }

  // ============= TASK OPERATIONS (delegate to taskService) =============

  async createTask(input: CreateTaskInput): Promise<NotionTask> {
    return taskService.createTask(input);
  }

  async getTask(
    taskId: string,
    options?: { forceRefresh?: boolean; skipCache?: boolean }
  ): Promise<NotionTask> {
    return taskService.getTask(taskId, options);
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<NotionTask> {
    return taskService.updateTask(taskId, input);
  }

  async archiveTask(taskId: string): Promise<void> {
    return taskService.archiveTask(taskId);
  }

  async queryTrafficDatabase(
    cursor?: string,
    pageSize?: number
  ): Promise<DatabaseQueryResult<NotionTask>> {
    return taskService.queryTrafficDatabase(cursor, pageSize);
  }

  async queryTasksWithFilters(filters: any): Promise<NotionTask[]> {
    return taskService.queryTasksWithFilters(filters);
  }

  async getAllTrafficTasks(): Promise<NotionTask[]> {
    return taskService.getAllTrafficTasks();
  }

  // ============= CALENDAR OPERATIONS (delegate to calendarService) =============

  async getTasksForCalendarView(
    startDate: Date,
    endDate: Date,
    options?: any
  ): Promise<NotionTask[]> {
    return calendarService.getTasksForCalendarView(startDate, endDate, options);
  }

  async preloadCalendarCache(centerDate?: Date): Promise<void> {
    return calendarService.preloadCalendarCache(centerDate);
  }

  async getWeekTasks(weekStart: Date): Promise<NotionTask[]> {
    return calendarService.getWeekTasks(weekStart);
  }

  async getMonthTasks(year: number, month: number): Promise<NotionTask[]> {
    return calendarService.getMonthTasks(year, month);
  }

  async getDayTasks(date: Date): Promise<NotionTask[]> {
    return calendarService.getDayTasks(date);
  }

  async getUpcomingTasks(days?: number): Promise<NotionTask[]> {
    return calendarService.getUpcomingTasks(days);
  }

  async getOverdueTasks(): Promise<NotionTask[]> {
    return calendarService.getOverdueTasks();
  }

  // ============= ENTITY OPERATIONS (delegate to entityService) =============

  async queryUsersDatabase(
    cursor?: string,
    pageSize?: number,
    options?: any
  ): Promise<DatabaseQueryResult<NotionMember>> {
    return entityService.queryUsersDatabase(cursor, pageSize, options);
  }

  async getAllMembers(): Promise<NotionMember[]> {
    return entityService.getAllMembers();
  }

  async queryProjectsDatabase(
    filters?: any,
    cursor?: string,
    pageSize?: number,
    options?: any
  ): Promise<DatabaseQueryResult<NotionProject>> {
    return entityService.queryProjectsDatabase(filters, cursor, pageSize, options);
  }

  async getAllProjects(filters?: any): Promise<NotionProject[]> {
    return entityService.getAllProjects(filters);
  }

  async queryClientsDatabase(
    cursor?: string,
    pageSize?: number,
    options?: any
  ): Promise<DatabaseQueryResult<NotionClient>> {
    return entityService.queryClientsDatabase(cursor, pageSize, options);
  }

  async getAllClients(): Promise<NotionClient[]> {
    return entityService.getAllClients();
  }

  async queryTeamsDatabase(
    cursor?: string,
    pageSize?: number,
    options?: any
  ): Promise<DatabaseQueryResult<NotionTeam>> {
    return entityService.queryTeamsDatabase(cursor, pageSize, options);
  }

  async getAllTeams(): Promise<NotionTeam[]> {
    return entityService.getAllTeams();
  }

  // ============= CACHE OPERATIONS (delegate to cacheManagerService) =============

  async getCacheStats(): Promise<any> {
    return cacheManagerService.getCacheStats();
  }

  async clearAllCache(): Promise<void> {
    return cacheManagerService.clearAllCache();
  }

  async warmupCache(): Promise<void> {
    logger.info('Starting comprehensive cache warmup...');

    // Warmup calendar view for current month
    await calendarService.preloadCalendarCache();

    // Warmup frequently accessed entities
    await entityService.warmupEntityCaches();

    logger.info('Cache warmup completed successfully');
  }

  // ============= BATCH RESOLUTION OPERATIONS (new) =============

  /**
   * Resolve all relations for given data using batch loading
   * Prevents N+1 queries by loading all related entities in parallel
   */
  async batchResolveRelations(data: {
    tasks?: NotionTask[];
    projects?: NotionProject[];
    teams?: NotionTeam[];
  }): Promise<any> {
    return this.batchResolver.batchResolveRelations(data);
  }

  /**
   * Load multiple members by IDs using batch loading
   */
  async batchLoadMembers(ids: string[]): Promise<(NotionMember | null)[]> {
    return this.batchResolver.loadMembers(ids);
  }

  /**
   * Load multiple projects by IDs using batch loading
   */
  async batchLoadProjects(ids: string[]): Promise<(NotionProject | null)[]> {
    return this.batchResolver.loadProjects(ids);
  }

  /**
   * Load multiple clients by IDs using batch loading
   */
  async batchLoadClients(ids: string[]): Promise<(NotionClient | null)[]> {
    return this.batchResolver.loadClients(ids);
  }

  /**
   * Load multiple teams by IDs using batch loading
   */
  async batchLoadTeams(ids: string[]): Promise<(NotionTeam | null)[]> {
    return this.batchResolver.loadTeams(ids);
  }

  /**
   * Clear all batch loading caches (useful for testing)
   */
  clearBatchResolverCache(): void {
    this.batchResolver.clearAll();
  }
}

// Export singleton instance for backward compatibility
const notionService = new NotionService();
export default notionService;
