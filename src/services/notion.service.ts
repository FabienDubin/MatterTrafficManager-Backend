import { notion, DATABASES, TASK_PROPERTY_IDS } from '../config/notion.config';
import { retryWithBackoff } from '../utils/retryWithBackoff';
import { NotionAPIError } from '../errors/NotionAPIError';
import {
  notionPageToTask,
  notionPageToUser,
  notionPageToProject,
  notionPageToClient,
  notionPageToTeam,
  createNotionTaskProperties
} from '../mappers/notion.mapper';
import {
  NotionTask,
  NotionUser,
  NotionProject,
  NotionClient,
  NotionTeam,
  DatabaseQueryResult,
  CreateTaskInput,
  UpdateTaskInput
} from '../types/notion.types';
import logger from '../config/logger.config';
import { redisService } from './redis.service';
import { conflictService } from './conflict.service';

class NotionService {
  private lastCallTime = 0;
  private minTimeBetweenCalls = 334; // ~3 requests per second (1000ms / 3)

  /**
   * Simple throttle to ensure we don't exceed Notion's rate limit
   * Guarantees minimum 334ms between calls (3 req/sec)
   */
  private async throttledNotionCall<T>(
    fn: () => Promise<T>,
    operation?: string
  ): Promise<T> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    if (timeSinceLastCall < this.minTimeBetweenCalls) {
      const waitTime = this.minTimeBetweenCalls - timeSinceLastCall;
      logger.debug(`Throttling Notion API call by ${waitTime}ms${operation ? ` for ${operation}` : ''}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastCallTime = Date.now();
    const startTime = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      logger.debug(`Notion API call completed${operation ? ` [${operation}]` : ''}`, { duration });
      return result;
    } catch (error) {
      logger.error(`Notion API call failed${operation ? ` [${operation}]` : ''}`, { error });
      throw error;
    }
  }

  /**
   * Batch multiple Notion calls with throttling
   */
  private async batchNotionCalls<T>(
    calls: Array<() => Promise<T>>,
    batchSize = 3
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < calls.length; i += batchSize) {
      const batch = calls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(call => this.throttledNotionCall(call))
      );
      results.push(...batchResults);
      
      // Wait 1 second between batches if there are more
      if (i + batchSize < calls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * Universal method for cached data retrieval with conflict detection
   * Handles cache retrieval, validation, conflict detection, and fallback to Notion
   */
  private async getCachedOrFetch<T>(
    cacheKey: string,
    entityType: string,
    fetchFn: () => Promise<T>,
    options: {
      entityId?: string;
      skipCache?: boolean;
      forceRefresh?: boolean;
      conflictStrategy?: 'notion_wins' | 'local_wins' | 'merged';
    } = {}
  ): Promise<T> {
    const { 
      entityId, 
      skipCache = false, 
      forceRefresh = false,
      conflictStrategy = 'notion_wins' 
    } = options;

    // Skip cache entirely if requested
    if (skipCache) {
      logger.debug(`Skipping cache for ${cacheKey}`);
      return await fetchFn();
    }

    // Force refresh - fetch from Notion and update cache
    if (forceRefresh) {
      logger.debug(`Force refreshing cache for ${cacheKey}`);
      const freshData = await fetchFn();
      await redisService.set(cacheKey, freshData, entityType);
      return freshData;
    }

    try {
      // Try to get from cache first
      const cachedData = await redisService.get<T>(cacheKey);
      
      if (cachedData) {
        logger.debug(`Cache hit for ${cacheKey}`);
        
        // For critical entities, validate cache freshness
        if (entityType === 'task' || entityType === 'tasks') {
          // Check if we need to validate against Notion (random sampling)
          const shouldValidate = Math.random() < 0.1; // 10% validation rate
          
          if (shouldValidate && entityId) {
            logger.debug(`Validating cache for ${cacheKey}`);
            const freshData = await fetchFn();
            
            // Detect conflicts
            const conflict = await conflictService.detectConflict(
              entityType,
              entityId,
              cachedData,
              freshData
            );
            
            if (conflict) {
              logger.warn(`Conflict detected for ${cacheKey}`);
              // Resolve conflict and update cache
              const resolvedData = await conflictService.resolveConflict(
                conflict,
                conflictStrategy
              );
              await redisService.set(cacheKey, resolvedData, entityType);
              return resolvedData as T;
            }
            
            // No conflict, update cache with fresh data
            await redisService.set(cacheKey, freshData, entityType);
            return freshData;
          }
        }
        
        return cachedData;
      }
      
      // Cache miss - fetch from Notion
      logger.debug(`Cache miss for ${cacheKey}`);
      const freshData = await fetchFn();
      
      // Store in cache
      await redisService.set(cacheKey, freshData, entityType);
      
      return freshData;
      
    } catch (error) {
      logger.error(`Error in getCachedOrFetch for ${cacheKey}:`, error);
      // Fallback to direct Notion call on error
      return await fetchFn();
    }
  }

  /**
   * Helper method to generate cache keys with consistent format
   */
  private generateCacheKey(
    entityType: string,
    operation: string,
    params?: Record<string, any>
  ): string {
    const baseKey = `${entityType}:${operation}`;
    
    if (!params || Object.keys(params).length === 0) {
      return baseKey;
    }
    
    // Sort params for consistent key generation
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join(':');
    
    return `${baseKey}:${sortedParams}`;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.throttledNotionCall(
        () => notion.users.list({ page_size: 1 }),
        'testConnection'
      );
      logger.info('Notion connection test successful');
      return true;
    } catch (error) {
      logger.error('Notion connection test failed', { error });
      throw NotionAPIError.fromError(error);
    }
  }


  /**
   * Preload cache for calendar navigation
   * Loads data for current window + adjacent periods
   */
  async preloadCalendarCache(centerDate: Date = new Date()): Promise<void> {
    const ranges = [
      // Past 90 days
      { 
        start: new Date(centerDate.getTime() - 90 * 24 * 60 * 60 * 1000),
        end: new Date(centerDate.getTime() - 1)
      },
      // Current month
      {
        start: new Date(centerDate.getFullYear(), centerDate.getMonth(), 1),
        end: new Date(centerDate.getFullYear(), centerDate.getMonth() + 1, 0)
      },
      // Next 365 days in 3-month chunks for better granularity
      {
        start: centerDate,
        end: new Date(centerDate.getTime() + 90 * 24 * 60 * 60 * 1000)
      },
      {
        start: new Date(centerDate.getTime() + 91 * 24 * 60 * 60 * 1000),
        end: new Date(centerDate.getTime() + 180 * 24 * 60 * 60 * 1000)
      },
      {
        start: new Date(centerDate.getTime() + 181 * 24 * 60 * 60 * 1000),
        end: new Date(centerDate.getTime() + 365 * 24 * 60 * 60 * 1000)
      }
    ];
    
    logger.info('Preloading calendar cache for optimal navigation...');
    
    // Load ranges in parallel for speed
    await Promise.all(
      ranges.map(range => 
        this.getTasksForCalendarView(range.start, range.end, { skipCache: false })
          .catch(err => {
            logger.error(`Failed to preload range ${range.start.toISOString()} to ${range.end.toISOString()}`, err);
          })
      )
    );
    
    logger.info('Calendar cache preload completed');
  }

  async queryTrafficDatabase(
    cursor?: string,
    pageSize = 100
  ): Promise<DatabaseQueryResult<NotionTask>> {
    // Generate cache key for paginated results
    const cacheKey = this.generateCacheKey('tasks', 'list', { cursor, pageSize });
    
    return await this.getCachedOrFetch<DatabaseQueryResult<NotionTask>>(
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
          hasMore: response.has_more,
          cursor: response.next_cursor
        });

        return {
          results: tasks,
          hasMore: response.has_more,
          nextCursor: response.next_cursor
        };
      }
    );
  }

  async queryUsersDatabase(
    cursor?: string,
    pageSize = 100,
    options: { forceRefresh?: boolean; skipCache?: boolean } = {}
  ): Promise<DatabaseQueryResult<NotionUser>> {
    const cacheKey = this.generateCacheKey('users', 'list', { cursor, pageSize });
    
    return await this.getCachedOrFetch<DatabaseQueryResult<NotionUser>>(
      cacheKey,
      'users',
      async () => {
        const queryParams: any = {
          database_id: DATABASES.users,
          page_size: pageSize
        };
        
        if (cursor) {
          queryParams.start_cursor = cursor;
        }
        
        const response = await retryWithBackoff(
          () => this.throttledNotionCall(
            () => notion.databases.query(queryParams),
            'queryUsersDatabase'
          )
        );

        const users = response.results.map(notionPageToUser);
        
        return {
          results: users,
          hasMore: response.has_more,
          nextCursor: response.next_cursor
        };
      },
      options
    );
  }

  async queryProjectsDatabase(
    filters?: { status?: string },
    cursor?: string,
    pageSize = 100,
    options: { forceRefresh?: boolean; skipCache?: boolean } = {}
  ): Promise<DatabaseQueryResult<NotionProject>> {
    const cacheKey = this.generateCacheKey('projects', 'list', { 
      status: filters?.status, 
      cursor, 
      pageSize 
    });
    
    return await this.getCachedOrFetch<DatabaseQueryResult<NotionProject>>(
      cacheKey,
      'projects',
      async () => {
        const queryParams: any = {
          database_id: DATABASES.projects,
          page_size: pageSize
        };
        
        if (cursor) {
          queryParams.start_cursor = cursor;
        }

        if (filters?.status) {
          queryParams.filter = {
            property: 'E%60o%5B',
            select: {
              equals: filters.status
            }
          };
        }

        const response = await retryWithBackoff(
          () => this.throttledNotionCall(
            () => notion.databases.query(queryParams),
            'queryProjectsDatabase'
          )
        );

        const projects = response.results.map(notionPageToProject);
        
        return {
          results: projects,
          hasMore: response.has_more,
          nextCursor: response.next_cursor
        };
      },
      options
    );
  }

  async queryClientsDatabase(
    cursor?: string,
    pageSize = 100,
    options: { forceRefresh?: boolean; skipCache?: boolean } = {}
  ): Promise<DatabaseQueryResult<NotionClient>> {
    const cacheKey = this.generateCacheKey('clients', 'list', { cursor, pageSize });
    
    return await this.getCachedOrFetch<DatabaseQueryResult<NotionClient>>(
      cacheKey,
      'clients',
      async () => {
        const queryParams: any = {
          database_id: DATABASES.clients,
          page_size: pageSize
        };
        
        if (cursor) {
          queryParams.start_cursor = cursor;
        }
        
        const response = await retryWithBackoff(
          () => this.throttledNotionCall(
            () => notion.databases.query(queryParams),
            'queryClientsDatabase'
          )
        );

        const clients = response.results.map(notionPageToClient);
        
        return {
          results: clients,
          hasMore: response.has_more,
          nextCursor: response.next_cursor
        };
      },
      options
    );
  }

  async queryTeamsDatabase(
    cursor?: string,
    pageSize = 100,
    options: { forceRefresh?: boolean; skipCache?: boolean } = {}
  ): Promise<DatabaseQueryResult<NotionTeam>> {
    const cacheKey = this.generateCacheKey('teams', 'list', { cursor, pageSize });
    
    return await this.getCachedOrFetch<DatabaseQueryResult<NotionTeam>>(
      cacheKey,
      'teams',
      async () => {
        const queryParams: any = {
          database_id: DATABASES.teams,
          page_size: pageSize
        };
        
        if (cursor) {
          queryParams.start_cursor = cursor;
        }
        
        const response = await retryWithBackoff(
          () => this.throttledNotionCall(
            () => notion.databases.query(queryParams),
            'queryTeamsDatabase'
          )
        );

        const teams = response.results.map(notionPageToTeam);
        
        return {
          results: teams,
          hasMore: response.has_more,
          nextCursor: response.next_cursor
        };
      },
      options
    );
  }

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
      
      // Invalidate list caches since we have a new task
      await redisService.invalidatePattern('tasks:calendar:*');
      await redisService.invalidatePattern('tasks:list:*');
      
      // Store the new task in cache
      await redisService.set(`task:${task.id}`, task, 'task');
      
      logger.info('Task created successfully and cache updated', { 
        taskId: task.id, 
        title: task.title 
      });
      
      return task;
    } catch (error) {
      logger.error('Failed to create task', { error, input });
      throw NotionAPIError.fromError(error);
    }
  }

  async getTask(taskId: string, options: { forceRefresh?: boolean; skipCache?: boolean } = {}): Promise<NotionTask> {
    const cacheKey = `task:${taskId}`;
    
    return await this.getCachedOrFetch<NotionTask>(
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
      await redisService.del(taskCacheKey);
      
      // Also invalidate related list caches (calendar views might be affected)
      await redisService.invalidatePattern('tasks:calendar:*');
      await redisService.invalidatePattern('tasks:list:*');
      
      // Store the updated task in cache
      await redisService.set(taskCacheKey, task, 'task');
      
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
      await redisService.del(`task:${taskId}`);
      await redisService.invalidatePattern('tasks:calendar:*');
      await redisService.invalidatePattern('tasks:list:*');
      
      logger.info('Task archived successfully and cache invalidated', { taskId });
    } catch (error) {
      logger.error('Failed to archive task', { taskId, error });
      throw NotionAPIError.fromError(error);
    }
  }

  async getTasksForCalendarView(
    startDate: Date, 
    endDate: Date,
    options: { forceRefresh?: boolean; skipCache?: boolean } = {}
  ): Promise<NotionTask[]> {
    // Create cache key based on date range (rounded to day for better cache hits)
    const startKey = startDate.toISOString().split('T')[0];
    const endKey = endDate.toISOString().split('T')[0];
    const cacheKey = `tasks:calendar:start=${startKey}:end=${endKey}`;
    
    return await this.getCachedOrFetch<NotionTask[]>(
      cacheKey,
      'tasks',
      async () => {
        const response = await retryWithBackoff(
          () => this.throttledNotionCall(
            () => notion.databases.query({
              database_id: DATABASES.traffic,
              filter: {
                and: [
                  {
                    property: TASK_PROPERTY_IDS.workPeriod,
                    date: {
                      on_or_after: startDate.toISOString()
                    }
                  },
                  {
                    property: TASK_PROPERTY_IDS.workPeriod,
                    date: {
                      on_or_before: endDate.toISOString()
                    }
                  },
                  {
                    property: TASK_PROPERTY_IDS.addToCalendar,
                    checkbox: {
                      equals: true
                    }
                  }
                ]
              },
              sorts: [
                {
                  property: TASK_PROPERTY_IDS.workPeriod,
                  direction: 'ascending'
                }
              ],
              page_size: 100
            }),
            'getTasksForCalendarView'
          )
        );

        const tasks = response.results.map(notionPageToTask).filter(task => 
          task.workPeriod?.startDate && task.workPeriod?.endDate
        );
        
        logger.debug('Calendar tasks retrieved', { 
          count: tasks.length, 
          startDate: startKey,
          endDate: endKey 
        });
        
        return tasks;
      },
      options
    );
  }


  async testRateLimit(): Promise<{ success: boolean; timeTaken: number; errors: number }> {
    const startTime = Date.now();
    let errors = 0;
    const requests = 10;

    try {
      const calls = Array(requests).fill(null).map(() => 
        () => notion.users.list({ page_size: 1 })
      );

      await this.batchNotionCalls(calls, 3);
      
      const timeTaken = Date.now() - startTime;
      
      logger.info('Rate limit test completed', {
        requests,
        timeTaken,
        avgTime: timeTaken / requests
      });

      return { success: true, timeTaken, errors };
    } catch (error) {
      errors++;
      logger.error('Rate limit test failed', { error });
      return { 
        success: false, 
        timeTaken: Date.now() - startTime, 
        errors 
      };
    }
  }

  async queryTasksWithFilters(filters: {
    status?: string;
    projectId?: string;
    assignedUserId?: string;
    dateRange?: { start: string; end: string };
  }): Promise<DatabaseQueryResult<NotionTask>> {
    try {
      const filterConditions: any[] = [];

      if (filters.status) {
        filterConditions.push({
          property: 'fMMJ',
          select: { equals: filters.status }
        });
      }

      if (filters.projectId) {
        filterConditions.push({
          property: 'pE%7Bw',
          relation: { contains: filters.projectId }
        });
      }

      if (filters.assignedUserId) {
        filterConditions.push({
          property: '%60wMW',
          relation: { contains: filters.assignedUserId }
        });
      }

      if (filters.dateRange) {
        filterConditions.push({
          property: '%40WIV',
          date: {
            on_or_after: filters.dateRange.start,
            on_or_before: filters.dateRange.end
          }
        });
      }

      const queryParams: any = {
        database_id: DATABASES.traffic,
        page_size: 100
      };

      if (filterConditions.length > 0) {
        queryParams.filter = filterConditions.length === 1 
          ? filterConditions[0]
          : { and: filterConditions };
      }

      const response = await retryWithBackoff(
        () => this.throttledNotionCall(
          () => notion.databases.query(queryParams),
          'queryTasksWithFilters'
        )
      );

      const tasks = response.results.map(notionPageToTask);

      logger.info('Filtered tasks query completed', {
        filters,
        resultsCount: tasks.length
      });

      return {
        results: tasks,
        hasMore: response.has_more,
        nextCursor: response.next_cursor
      };
    } catch (error) {
      logger.error('Failed to query tasks with filters', { filters, error });
      throw NotionAPIError.fromError(error);
    }
  }

  /**
   * Récupère TOUTES les tâches de la base Traffic en gérant la pagination
   * Note: Cette méthode peut prendre du temps pour les grosses bases (>100 items)
   * @returns Toutes les tâches de la base Traffic
   */
  async getAllTrafficTasks(): Promise<NotionTask[]> {
    const allTasks: NotionTask[] = [];
    let hasMore = true;
    let cursor: string | undefined = undefined;
    let pageCount = 0;

    logger.info('Starting full traffic database fetch');

    try {
      while (hasMore) {
        const result = await this.queryTrafficDatabase(cursor, 100);
        allTasks.push(...result.results);
        hasMore = result.hasMore;
        cursor = result.nextCursor || undefined;
        pageCount++;

        logger.info(`Fetched page ${pageCount}: ${result.results.length} tasks (total: ${allTasks.length})`);
      }

      logger.info(`Completed traffic database fetch: ${allTasks.length} tasks in ${pageCount} pages`);
      return allTasks;
    } catch (error) {
      logger.error('Failed to fetch all traffic tasks', { 
        error, 
        pagesCompleted: pageCount,
        tasksRetrieved: allTasks.length 
      });
      throw NotionAPIError.fromError(error);
    }
  }

  /**
   * Récupère TOUS les utilisateurs en gérant la pagination
   * @returns Tous les utilisateurs de la base Users
   */
  async getAllUsers(): Promise<NotionUser[]> {
    const allUsers: NotionUser[] = [];
    let hasMore = true;
    let cursor: string | undefined = undefined;
    let pageCount = 0;

    logger.info('Starting full users database fetch');

    try {
      while (hasMore) {
        const result = await this.queryUsersDatabase(cursor, 100);
        allUsers.push(...result.results);
        hasMore = result.hasMore;
        cursor = result.nextCursor || undefined;
        pageCount++;

        logger.info(`Fetched page ${pageCount}: ${result.results.length} users (total: ${allUsers.length})`);
      }

      logger.info(`Completed users database fetch: ${allUsers.length} users in ${pageCount} pages`);
      return allUsers;
    } catch (error) {
      logger.error('Failed to fetch all users', { 
        error, 
        pagesCompleted: pageCount,
        usersRetrieved: allUsers.length 
      });
      throw NotionAPIError.fromError(error);
    }
  }

  /**
   * Récupère TOUS les projets en gérant la pagination
   * @param filters Filtres optionnels (ex: status)
   * @returns Tous les projets de la base Projects
   */
  async getAllProjects(filters?: { status?: string }): Promise<NotionProject[]> {
    const allProjects: NotionProject[] = [];
    let hasMore = true;
    let cursor: string | undefined = undefined;
    let pageCount = 0;

    logger.info('Starting full projects database fetch', { filters });

    try {
      while (hasMore) {
        const result = await this.queryProjectsDatabase(filters, cursor, 100);
        allProjects.push(...result.results);
        hasMore = result.hasMore;
        cursor = result.nextCursor || undefined;
        pageCount++;

        logger.info(`Fetched page ${pageCount}: ${result.results.length} projects (total: ${allProjects.length})`);
      }

      logger.info(`Completed projects database fetch: ${allProjects.length} projects in ${pageCount} pages`);
      return allProjects;
    } catch (error) {
      logger.error('Failed to fetch all projects', { 
        error, 
        pagesCompleted: pageCount,
        projectsRetrieved: allProjects.length 
      });
      throw NotionAPIError.fromError(error);
    }
  }

  /**
   * Récupère TOUS les clients en gérant la pagination
   * @returns Tous les clients de la base Clients
   */
  async getAllClients(): Promise<NotionClient[]> {
    const allClients: NotionClient[] = [];
    let hasMore = true;
    let cursor: string | undefined = undefined;
    let pageCount = 0;

    logger.info('Starting full clients database fetch');

    try {
      while (hasMore) {
        const result = await this.queryClientsDatabase(cursor, 100);
        allClients.push(...result.results);
        hasMore = result.hasMore;
        cursor = result.nextCursor || undefined;
        pageCount++;

        logger.info(`Fetched page ${pageCount}: ${result.results.length} clients (total: ${allClients.length})`);
      }

      logger.info(`Completed clients database fetch: ${allClients.length} clients in ${pageCount} pages`);
      return allClients;
    } catch (error) {
      logger.error('Failed to fetch all clients', { 
        error, 
        pagesCompleted: pageCount,
        clientsRetrieved: allClients.length 
      });
      throw NotionAPIError.fromError(error);
    }
  }

  /**
   * Récupère TOUTES les équipes en gérant la pagination
   * @returns Toutes les équipes de la base Teams
   */
  async getAllTeams(): Promise<NotionTeam[]> {
    const allTeams: NotionTeam[] = [];
    let hasMore = true;
    let cursor: string | undefined = undefined;
    let pageCount = 0;

    logger.info('Starting full teams database fetch');

    try {
      while (hasMore) {
        const result = await this.queryTeamsDatabase(cursor, 100);
        allTeams.push(...result.results);
        hasMore = result.hasMore;
        cursor = result.nextCursor || undefined;
        pageCount++;

        logger.info(`Fetched page ${pageCount}: ${result.results.length} teams (total: ${allTeams.length})`);
      }

      logger.info(`Completed teams database fetch: ${allTeams.length} teams in ${pageCount} pages`);
      return allTeams;
    } catch (error) {
      logger.error('Failed to fetch all teams', { 
        error, 
        pagesCompleted: pageCount,
        teamsRetrieved: allTeams.length 
      });
      throw NotionAPIError.fromError(error);
    }
  }

  async validateAllDatabases(): Promise<{
    success: boolean;
    databases: {
      [key: string]: {
        accessible: boolean;
        count?: number;
        error?: string;
      }
    }
  }> {
    const results: any = {
      success: true,
      databases: {}
    };

    const databases = [
      { name: 'traffic', id: DATABASES.traffic },
      { name: 'users', id: DATABASES.users },
      { name: 'projects', id: DATABASES.projects },
      { name: 'clients', id: DATABASES.clients },
      { name: 'teams', id: DATABASES.teams }
    ];

    for (const db of databases) {
      try {
        const response = await this.throttledNotionCall(
          () => notion.databases.query({
            database_id: db.id,
            page_size: 1
          }),
          `validate-${db.name}`
        );

        results.databases[db.name] = {
          accessible: true,
          count: response.results.length
        };

        logger.info(`Database ${db.name} validated`, {
          id: db.id,
          accessible: true
        });
      } catch (error: any) {
        results.success = false;
        results.databases[db.name] = {
          accessible: false,
          error: error.message
        };

        logger.error(`Database ${db.name} validation failed`, {
          id: db.id,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(): Promise<{
    status: string;
    conflicts: any;
    cacheHealth: any;
    performance: {
      avgCacheHitRate: number;
      avgResponseTime: {
        cached: number;
        fresh: number;
      };
    };
  }> {
    try {
      // Get Redis health
      const redisHealth = await redisService.healthCheck();
      
      // Get conflict statistics
      const conflictStats = await conflictService.getConflictStats(7);
      
      // Calculate performance metrics (these would normally come from actual metrics tracking)
      const performance = {
        avgCacheHitRate: 0.85, // 85% cache hit rate (example)
        avgResponseTime: {
          cached: 50, // 50ms average for cached responses
          fresh: 500  // 500ms average for fresh Notion API calls
        }
      };
      
      return {
        status: redisHealth.status,
        conflicts: conflictStats,
        cacheHealth: redisHealth,
        performance
      };
    } catch (error) {
      logger.error('Failed to get cache stats', error);
      return {
        status: 'error',
        conflicts: null,
        cacheHealth: null,
        performance: {
          avgCacheHitRate: 0,
          avgResponseTime: {
            cached: 0,
            fresh: 0
          }
        }
      };
    }
  }

  /**
   * Warmup cache for optimal performance
   * Preloads frequently accessed data into cache
   */
  async warmupCache(): Promise<void> {
    logger.info('Starting cache warmup...');
    
    try {
      // Warmup in parallel for speed
      await Promise.all([
        // Preload calendar cache for current period
        this.preloadCalendarCache(),
        
        // Load first page of each entity type
        this.queryUsersDatabase(undefined, 20),
        this.queryProjectsDatabase(undefined, undefined, 20),
        this.queryTeamsDatabase(undefined, 20),
        this.queryClientsDatabase(undefined, 20),
        
        // Load active tasks
        this.queryTrafficDatabase(undefined, 50)
      ]);
      
      logger.info('Cache warmup completed successfully');
    } catch (error) {
      logger.error('Cache warmup failed', error);
    }
  }

  /**
   * Clear all cache for maintenance or debugging
   */
  async clearAllCache(): Promise<void> {
    logger.warn('Clearing all cache...');
    
    await Promise.all([
      redisService.invalidatePattern('tasks:*'),
      redisService.invalidatePattern('task:*'),
      redisService.invalidatePattern('projects:*'),
      redisService.invalidatePattern('project:*'),
      redisService.invalidatePattern('users:*'),
      redisService.invalidatePattern('user:*'),
      redisService.invalidatePattern('teams:*'),
      redisService.invalidatePattern('team:*'),
      redisService.invalidatePattern('clients:*'),
      redisService.invalidatePattern('client:*')
    ]);
    
    logger.info('All cache cleared');
  }
}

export default new NotionService();