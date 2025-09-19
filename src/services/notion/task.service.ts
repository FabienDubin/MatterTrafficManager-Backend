import { NotionBaseService } from './notion-base.service';
import { cacheManagerService } from './cache-manager.service';
import { notion, DATABASES, TASK_PROPERTY_IDS } from '../../config/notion.config';
import { retryWithBackoff } from '../../utils/retryWithBackoff';
import { NotionAPIError } from '../../errors/NotionAPIError';
import {
  notionPageToTask,
  createNotionTaskProperties
} from '../../mappers/notion.mapper';
import {
  NotionTask,
  DatabaseQueryResult,
  CreateTaskInput,
  UpdateTaskInput
} from '../../types/notion.types';
import logger from '../../config/logger.config';

/**
 * Service handling all task-related operations with Notion
 */
export class TaskService extends NotionBaseService {
  /**
   * Create a new task
   */
  async createTask(input: CreateTaskInput): Promise<NotionTask> {
    try {
      const properties = createNotionTaskProperties(input);
      
      const response = await retryWithBackoff(
        () => this.throttledNotionCall(
          () => notion.pages.create({
            parent: { database_id: DATABASES.traffic },
            properties
          }),
          'createTask'
        )
      );

      const task = notionPageToTask(response);
      
      // Invalidate list caches since a new task was added
      await cacheManagerService.invalidateCachePattern('tasks:calendar:*');
      await cacheManagerService.invalidateCachePattern('tasks:list:*');
      
      // Cache the new task
      const taskCacheKey = `task:${task.id}`;
      await cacheManagerService.setCache(taskCacheKey, task, 'task');
      
      logger.info('Task created successfully', { 
        taskId: task.id, 
        title: task.title 
      });
      
      return task;
    } catch (error) {
      logger.error('Failed to create task', { error, input });
      throw NotionAPIError.fromError(error);
    }
  }

  /**
   * Get a single task by ID
   */
  async getTask(taskId: string, options: { forceRefresh?: boolean; skipCache?: boolean } = {}): Promise<NotionTask> {
    const cacheKey = `task:${taskId}`;
    
    return await cacheManagerService.getCachedOrFetch<NotionTask>(
      cacheKey,
      'task',
      async () => {
        const response = await retryWithBackoff(
          () => this.throttledNotionCall(
            () => notion.pages.retrieve({ page_id: taskId }),
            'getTask'
          )
        );

        const task = notionPageToTask(response);
        logger.debug('Task retrieved', { taskId, title: task.title });
        
        return task;
      },
      { 
        entityId: taskId,
        ...options 
      }
    );
  }

  /**
   * Update an existing task
   */
  async updateTask(taskId: string, input: UpdateTaskInput): Promise<NotionTask> {
    try {
      const properties = createNotionTaskProperties(input);
      
      const response = await retryWithBackoff(
        () => this.throttledNotionCall(
          () => notion.pages.update({
            page_id: taskId,
            properties
          }),
          'updateTask'
        )
      );

      const task = notionPageToTask(response);
      
      // Invalidate cache for this specific task
      const taskCacheKey = `task:${taskId}`;
      await cacheManagerService.deleteCacheKey(taskCacheKey);
      
      // Also invalidate related list caches (calendar views might be affected)
      await cacheManagerService.invalidateCachePattern('tasks:calendar:*');
      await cacheManagerService.invalidateCachePattern('tasks:list:*');
      
      // Store the updated task in cache
      await cacheManagerService.setCache(taskCacheKey, task, 'task');
      
      logger.info('Task updated successfully and cache invalidated', { 
        taskId: task.id, 
        title: task.title,
        updatedFields: Object.keys(input)
      });
      
      return task;
    } catch (error) {
      logger.error('Failed to update task', { taskId, error });
      throw NotionAPIError.fromError(error);
    }
  }

  /**
   * Archive a task
   */
  async archiveTask(taskId: string): Promise<void> {
    try {
      await retryWithBackoff(
        () => this.throttledNotionCall(
          () => notion.pages.update({
            page_id: taskId,
            archived: true
          }),
          'archiveTask'
        )
      );

      // Invalidate cache for archived task
      await cacheManagerService.deleteCacheKey(`task:${taskId}`);
      await cacheManagerService.invalidateCachePattern('tasks:calendar:*');
      await cacheManagerService.invalidateCachePattern('tasks:list:*');
      
      logger.info('Task archived successfully and cache invalidated', { taskId });
    } catch (error) {
      logger.error('Failed to archive task', { taskId, error });
      throw NotionAPIError.fromError(error);
    }
  }

  /**
   * Query tasks database with pagination
   */
  async queryTrafficDatabase(
    cursor?: string,
    pageSize = 100
  ): Promise<DatabaseQueryResult<NotionTask>> {
    // Generate cache key for paginated results
    const cacheKey = this.generateCacheKey('tasks', 'list', { cursor, pageSize });
    
    return await cacheManagerService.getCachedOrFetch<DatabaseQueryResult<NotionTask>>(
      cacheKey,
      'tasks',
      async () => {
        const queryParams: any = {
          database_id: DATABASES.traffic,
          page_size: pageSize
        };
        
        if (cursor) {
          queryParams.start_cursor = cursor;
        }
        
        const response = await retryWithBackoff(
          () => this.throttledNotionCall(
            () => notion.databases.query(queryParams),
            'queryTrafficDatabase'
          ),
          3,
          1000,
          'queryTrafficDatabase'
        );

        const tasks = response.results.map(notionPageToTask);
        
        logger.info('Traffic database queried successfully', {
          count: tasks.length,
          hasMore: response.has_more
        });
        
        return {
          results: tasks,
          hasMore: response.has_more,
          nextCursor: response.next_cursor
        };
      }
    );
  }

  /**
   * Query tasks with advanced filters
   */
  async queryTasksWithFilters(filters: {
    status?: string;
    assignedTo?: string;
    projectId?: string;
    dateRange?: { start: Date; end: Date };
    taskType?: string;
  }): Promise<NotionTask[]> {
    const filter: any = { and: [] };
    
    if (filters.status) {
      filter.and.push({
        property: TASK_PROPERTY_IDS.status,
        status: { equals: filters.status }
      });
    }
    
    if (filters.assignedTo) {
      filter.and.push({
        property: TASK_PROPERTY_IDS.assignedMembers,
        relation: { contains: filters.assignedTo }
      });
    }
    
    if (filters.projectId) {
      filter.and.push({
        property: TASK_PROPERTY_IDS.projectId,
        relation: { contains: filters.projectId }
      });
    }
    
    if (filters.taskType) {
      filter.and.push({
        property: TASK_PROPERTY_IDS.taskType,
        select: { equals: filters.taskType }
      });
    }
    
    if (filters.dateRange) {
      filter.and.push({
        property: TASK_PROPERTY_IDS.workPeriod,
        date: {
          on_or_after: filters.dateRange.start.toISOString(),
          on_or_before: filters.dateRange.end.toISOString()
        }
      });
    }

    // Generate cache key based on filters
    const cacheKey = this.generateCacheKey('tasks', 'filtered', filters);
    
    return await cacheManagerService.getCachedOrFetch<NotionTask[]>(
      cacheKey,
      'tasks',
      async () => {
        const response = await retryWithBackoff(
          () => this.throttledNotionCall(
            () => notion.databases.query({
              database_id: DATABASES.traffic,
              filter: filter.and.length > 0 ? filter : undefined,
              page_size: 100
            }),
            'queryTasksWithFilters'
          )
        );

        const tasks = response.results.map(notionPageToTask);
        
        logger.info('Filtered tasks query successful', {
          filters,
          count: tasks.length
        });
        
        return tasks;
      }
    );
  }

  /**
   * Get all tasks (handles pagination)
   */
  async getAllTrafficTasks(): Promise<NotionTask[]> {
    const cacheKey = 'tasks:all';
    
    return await cacheManagerService.getCachedOrFetch<NotionTask[]>(
      cacheKey,
      'tasks',
      async () => {
        let allTasks: NotionTask[] = [];
        let cursor: string | undefined = undefined;
        let hasMore = true;
        
        while (hasMore) {
          const result = await this.queryTrafficDatabase(cursor);
          allTasks = allTasks.concat(result.results);
          hasMore = result.hasMore;
          cursor = result.nextCursor || undefined;
        }
        
        logger.info(`Retrieved all tasks: ${allTasks.length} total`);
        return allTasks;
      }
    );
  }
}

// Export singleton instance
export const taskService = new TaskService();