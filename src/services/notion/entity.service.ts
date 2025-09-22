import { NotionBaseService } from './notion-base.service';
import { cacheManagerService } from './cache-manager.service';
import { notion, DATABASES } from '../../config/notion.config';
import { retryWithBackoff } from '../../utils/retryWithBackoff';
import {
  notionPageToUser,
  notionPageToProject,
  notionPageToClient,
  notionPageToTeam,
} from '../../mappers/notion.mapper';
import {
  NotionMember,
  NotionProject,
  NotionClient,
  NotionTeam,
  DatabaseQueryResult,
} from '../../types/notion.types';
import logger from '../../config/logger.config';

/**
 * Service handling all entity operations (Users, Projects, Teams, Clients)
 */
export class EntityService extends NotionBaseService {
  // ============= USERS =============

  /**
   * Query users database with pagination and caching
   */
  async queryUsersDatabase(
    cursor?: string,
    pageSize = 100,
    options: { forceRefresh?: boolean; skipCache?: boolean } = {}
  ): Promise<DatabaseQueryResult<NotionMember>> {
    const cacheKey = this.generateCacheKey('users', 'list', { cursor, pageSize });

    return await cacheManagerService.getCachedOrFetch<DatabaseQueryResult<NotionMember>>(
      cacheKey,
      'users',
      async () => {
        const queryParams: any = {
          database_id: DATABASES.users,
          page_size: pageSize,
        };

        if (cursor) {
          queryParams.start_cursor = cursor;
        }

        const response = await retryWithBackoff(() =>
          this.throttledNotionCall(() => notion.databases.query(queryParams), 'queryUsersDatabase')
        );

        const users = response.results.map(notionPageToUser);

        logger.info('Users database queried successfully', {
          count: users.length,
          hasMore: response.has_more,
        });

        return {
          results: users,
          hasMore: response.has_more,
          nextCursor: response.next_cursor,
        };
      },
      options
    );
  }

  /**
   * Get all members (handles pagination)
   */
  async getAllMembers(): Promise<NotionMember[]> {
    const cacheKey = 'users:all';

    return await cacheManagerService.getCachedOrFetch<NotionMember[]>(
      cacheKey,
      'users',
      async () => {
        let allUsers: NotionMember[] = [];
        let cursor: string | undefined = undefined;
        let hasMore = true;

        while (hasMore) {
          const result = await this.queryUsersDatabase(cursor);
          allUsers = allUsers.concat(result.results);
          hasMore = result.hasMore;
          cursor = result.nextCursor || undefined;
        }

        logger.info(`Retrieved all users: ${allUsers.length} total`);
        return allUsers;
      }
    );
  }

  // ============= PROJECTS =============

  /**
   * Query projects database with pagination and optional filters
   */
  async queryProjectsDatabase(
    filters?: { status?: string },
    cursor?: string,
    pageSize = 100,
    options: { forceRefresh?: boolean; skipCache?: boolean } = {}
  ): Promise<DatabaseQueryResult<NotionProject>> {
    const cacheKey = this.generateCacheKey('projects', 'list', {
      status: filters?.status,
      cursor,
      pageSize,
    });

    return await cacheManagerService.getCachedOrFetch<DatabaseQueryResult<NotionProject>>(
      cacheKey,
      'projects',
      async () => {
        const queryParams: any = {
          database_id: DATABASES.projects,
          page_size: pageSize,
        };

        if (cursor) {
          queryParams.start_cursor = cursor;
        }

        if (filters?.status) {
          queryParams.filter = {
            property: 'Statut du projet',
            select: {
              equals: filters.status,
            },
          };
        }

        const response = await retryWithBackoff(() =>
          this.throttledNotionCall(
            () => notion.databases.query(queryParams),
            'queryProjectsDatabase'
          )
        );

        const projects = response.results.map(notionPageToProject);

        return {
          results: projects,
          hasMore: response.has_more,
          nextCursor: response.next_cursor,
        };
      },
      options
    );
  }

  /**
   * Get all projects with optional status filter
   */
  async getAllProjects(filters?: { status?: string }): Promise<NotionProject[]> {
    const cacheKey = this.generateCacheKey('projects', 'all', filters || {});

    return await cacheManagerService.getCachedOrFetch<NotionProject[]>(
      cacheKey,
      'projects',
      async () => {
        let allProjects: NotionProject[] = [];
        let cursor: string | undefined = undefined;
        let hasMore = true;

        while (hasMore) {
          const result = await this.queryProjectsDatabase(filters, cursor);
          allProjects = allProjects.concat(result.results);
          hasMore = result.hasMore;
          cursor = result.nextCursor || undefined;
        }

        logger.info(`Retrieved all projects: ${allProjects.length} total`);
        return allProjects;
      }
    );
  }

  // ============= CLIENTS =============

  /**
   * Query clients database with pagination
   */
  async queryClientsDatabase(
    cursor?: string,
    pageSize = 100,
    options: { forceRefresh?: boolean; skipCache?: boolean } = {}
  ): Promise<DatabaseQueryResult<NotionClient>> {
    const cacheKey = this.generateCacheKey('clients', 'list', { cursor, pageSize });

    return await cacheManagerService.getCachedOrFetch<DatabaseQueryResult<NotionClient>>(
      cacheKey,
      'clients',
      async () => {
        const queryParams: any = {
          database_id: DATABASES.clients,
          page_size: pageSize,
        };

        if (cursor) {
          queryParams.start_cursor = cursor;
        }

        const response = await retryWithBackoff(() =>
          this.throttledNotionCall(
            () => notion.databases.query(queryParams),
            'queryClientsDatabase'
          )
        );

        const clients = response.results.map(notionPageToClient);

        return {
          results: clients,
          hasMore: response.has_more,
          nextCursor: response.next_cursor,
        };
      },
      options
    );
  }

  /**
   * Get all clients (handles pagination)
   */
  async getAllClients(): Promise<NotionClient[]> {
    const cacheKey = 'clients:all';

    return await cacheManagerService.getCachedOrFetch<NotionClient[]>(
      cacheKey,
      'clients',
      async () => {
        let allClients: NotionClient[] = [];
        let cursor: string | undefined = undefined;
        let hasMore = true;

        while (hasMore) {
          const result = await this.queryClientsDatabase(cursor);
          allClients = allClients.concat(result.results);
          hasMore = result.hasMore;
          cursor = result.nextCursor || undefined;
        }

        logger.info(`Retrieved all clients: ${allClients.length} total`);
        return allClients;
      }
    );
  }

  // ============= TEAMS =============

  /**
   * Query teams database with pagination
   */
  async queryTeamsDatabase(
    cursor?: string,
    pageSize = 100,
    options: { forceRefresh?: boolean; skipCache?: boolean } = {}
  ): Promise<DatabaseQueryResult<NotionTeam>> {
    const cacheKey = this.generateCacheKey('teams', 'list', { cursor, pageSize });

    return await cacheManagerService.getCachedOrFetch<DatabaseQueryResult<NotionTeam>>(
      cacheKey,
      'teams',
      async () => {
        const queryParams: any = {
          database_id: DATABASES.teams,
          page_size: pageSize,
        };

        if (cursor) {
          queryParams.start_cursor = cursor;
        }

        const response = await retryWithBackoff(() =>
          this.throttledNotionCall(() => notion.databases.query(queryParams), 'queryTeamsDatabase')
        );

        const teams = response.results.map(notionPageToTeam);

        return {
          results: teams,
          hasMore: response.has_more,
          nextCursor: response.next_cursor,
        };
      },
      options
    );
  }

  /**
   * Get all teams (handles pagination)
   */
  async getAllTeams(): Promise<NotionTeam[]> {
    const cacheKey = 'teams:all';

    return await cacheManagerService.getCachedOrFetch<NotionTeam[]>(cacheKey, 'teams', async () => {
      let allTeams: NotionTeam[] = [];
      let cursor: string | undefined = undefined;
      let hasMore = true;

      while (hasMore) {
        const result = await this.queryTeamsDatabase(cursor);
        allTeams = allTeams.concat(result.results);
        hasMore = result.hasMore;
        cursor = result.nextCursor || undefined;
      }

      logger.info(`Retrieved all teams: ${allTeams.length} total`);
      return allTeams;
    });
  }

  // ============= CACHE MANAGEMENT =============

  /**
   * Invalidate all entity caches
   */
  async invalidateEntityCaches(): Promise<void> {
    await Promise.all([
      cacheManagerService.invalidateCachePattern('users:*'),
      cacheManagerService.invalidateCachePattern('projects:*'),
      cacheManagerService.invalidateCachePattern('clients:*'),
      cacheManagerService.invalidateCachePattern('teams:*'),
    ]);
    logger.info('All entity caches invalidated');
  }

  /**
   * Warmup entity caches
   */
  async warmupEntityCaches(): Promise<void> {
    logger.info('Warming up entity caches...');

    await Promise.all([
      this.queryUsersDatabase(undefined, 20),
      this.queryProjectsDatabase(undefined, undefined, 20),
      this.queryTeamsDatabase(undefined, 10),
      this.queryClientsDatabase(undefined, 10),
    ]);

    logger.info('Entity cache warmup completed');
  }
}

// Export singleton instance
export const entityService = new EntityService();
