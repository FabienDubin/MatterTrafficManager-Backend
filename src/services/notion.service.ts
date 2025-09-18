import { notion, DATABASES } from '../config/notion.config';
import { throttledNotionCall, batchNotionCalls } from './rateLimiter.service';
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

class NotionService {
  async testConnection(): Promise<boolean> {
    try {
      await throttledNotionCall(
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

  async queryTrafficDatabase(
    cursor?: string,
    pageSize = 100
  ): Promise<DatabaseQueryResult<NotionTask>> {
    try {
      const queryParams: any = {
        database_id: DATABASES.traffic,
        page_size: pageSize
      };
      
      if (cursor) {
        queryParams.start_cursor = cursor;
      }
      
      const response = await retryWithBackoff(
        () => throttledNotionCall(
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
    } catch (error) {
      logger.error('Failed to query traffic database', { error });
      throw NotionAPIError.fromError(error);
    }
  }

  async queryUsersDatabase(
    cursor?: string,
    pageSize = 100
  ): Promise<DatabaseQueryResult<NotionUser>> {
    try {
      const queryParams: any = {
        database_id: DATABASES.users,
        page_size: pageSize
      };
      
      if (cursor) {
        queryParams.start_cursor = cursor;
      }
      
      const response = await retryWithBackoff(
        () => throttledNotionCall(
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
    } catch (error) {
      logger.error('Failed to query users database', { error });
      throw NotionAPIError.fromError(error);
    }
  }

  async queryProjectsDatabase(
    filters?: { status?: string },
    cursor?: string,
    pageSize = 100
  ): Promise<DatabaseQueryResult<NotionProject>> {
    try {
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
        () => throttledNotionCall(
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
    } catch (error) {
      logger.error('Failed to query projects database', { error });
      throw NotionAPIError.fromError(error);
    }
  }

  async queryClientsDatabase(
    cursor?: string,
    pageSize = 100
  ): Promise<DatabaseQueryResult<NotionClient>> {
    try {
      const queryParams: any = {
        database_id: DATABASES.clients,
        page_size: pageSize
      };
      
      if (cursor) {
        queryParams.start_cursor = cursor;
      }
      
      const response = await retryWithBackoff(
        () => throttledNotionCall(
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
    } catch (error) {
      logger.error('Failed to query clients database', { error });
      throw NotionAPIError.fromError(error);
    }
  }

  async queryTeamsDatabase(
    cursor?: string,
    pageSize = 100
  ): Promise<DatabaseQueryResult<NotionTeam>> {
    try {
      const queryParams: any = {
        database_id: DATABASES.teams,
        page_size: pageSize
      };
      
      if (cursor) {
        queryParams.start_cursor = cursor;
      }
      
      const response = await retryWithBackoff(
        () => throttledNotionCall(
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
    } catch (error) {
      logger.error('Failed to query teams database', { error });
      throw NotionAPIError.fromError(error);
    }
  }

  async createTask(input: CreateTaskInput): Promise<NotionTask> {
    try {
      const properties = createNotionTaskProperties(input);
      
      const response = await retryWithBackoff(
        () => throttledNotionCall(
          () => notion.pages.create({
            parent: { database_id: DATABASES.traffic },
            properties
          }),
          'createTask'
        )
      );

      const task = notionPageToTask(response);
      
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

  async getTask(taskId: string): Promise<NotionTask> {
    try {
      const response = await retryWithBackoff(
        () => throttledNotionCall(
          () => notion.pages.retrieve({ page_id: taskId }),
          'getTask'
        )
      );

      const task = notionPageToTask(response);
      
      logger.debug('Task retrieved', { taskId, title: task.title });
      
      return task;
    } catch (error) {
      logger.error('Failed to get task', { taskId, error });
      throw NotionAPIError.fromError(error);
    }
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<NotionTask> {
    try {
      const properties = createNotionTaskProperties(input);
      
      const response = await retryWithBackoff(
        () => throttledNotionCall(
          () => notion.pages.update({
            page_id: taskId,
            properties
          }),
          'updateTask'
        )
      );

      const task = notionPageToTask(response);
      
      logger.info('Task updated successfully', { 
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
        () => throttledNotionCall(
          () => notion.pages.update({
            page_id: taskId,
            archived: true
          }),
          'archiveTask'
        )
      );

      logger.info('Task archived successfully', { taskId });
    } catch (error) {
      logger.error('Failed to archive task', { taskId, error });
      throw NotionAPIError.fromError(error);
    }
  }

  async testRateLimit(): Promise<{ success: boolean; timeTaken: number; errors: number }> {
    const startTime = Date.now();
    let errors = 0;
    const requests = 10;

    try {
      const calls = Array(requests).fill(null).map(() => 
        () => notion.users.list({ page_size: 1 })
      );

      await batchNotionCalls(calls, 3);
      
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
        () => throttledNotionCall(
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
        const response = await throttledNotionCall(
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
}

export default new NotionService();