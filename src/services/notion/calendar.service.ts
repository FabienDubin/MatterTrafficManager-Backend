import { NotionBaseService } from './notion-base.service';
import { cacheManagerService } from './cache-manager.service';
import { notion, DATABASES, TASK_PROPERTY_IDS } from '../../config/notion.config';
import { retryWithBackoff } from '../../utils/retryWithBackoff';
import { notionPageToTask } from '../../mappers/notion.mapper';
import { NotionTask } from '../../types/notion.types';
import logger from '../../config/logger.config';

/**
 * Service optimized for calendar views and date-based task queries
 * Implements sliding window caching strategy for optimal performance
 */
export class CalendarService extends NotionBaseService {
  /**
   * Get tasks for calendar view with optimized date-range caching
   * Supports lateral scroll from -90 to +365 days
   */
  async getTasksForCalendarView(
    startDate: Date,
    endDate: Date,
    options: { forceRefresh?: boolean; skipCache?: boolean } = {}
  ): Promise<NotionTask[]> {
    // Create cache key based on date range (rounded to day for better cache hits)
    const startKey = startDate.toISOString().split('T')[0];
    const endKey = endDate.toISOString().split('T')[0];
    const cacheKey = `tasks:calendar:start=${startKey}:end=${endKey}`;

    return await cacheManagerService.getCachedOrFetch<NotionTask[]>(
      cacheKey,
      'tasks',
      async () => {
        // Paginer pour récupérer TOUTES les tâches
        let allResults: any[] = [];
        let hasMore = true;
        let startCursor: string | undefined = undefined;

        // Élargir la période de recherche pour capturer les tâches qui chevauchent
        // On ajoute 30 jours de marge avant et après pour les tâches longues
        const searchStartDate = new Date(startDate);
        searchStartDate.setDate(searchStartDate.getDate() - 30);
        const searchEndDate = new Date(endDate);
        searchEndDate.setDate(searchEndDate.getDate() + 30);

        while (hasMore) {
          const queryParams: any = {
            database_id: DATABASES.traffic,
            // Filtre optimisé : récupère les tâches dans une fenêtre élargie
            // Puis on affine avec le filtrage JS pour le chevauchement exact
            filter: {
              // Utiliser seulement on_or_after pour capturer les tâches sans date de fin
              property: TASK_PROPERTY_IDS.workPeriod,
              date: {
                on_or_after: searchStartDate.toISOString(),
              },
            },
            sorts: [
              {
                property: TASK_PROPERTY_IDS.workPeriod,
                direction: 'ascending',
              },
            ],
            page_size: 100,
          };
          
          // Ajouter start_cursor seulement s'il existe
          if (startCursor) {
            queryParams.start_cursor = startCursor;
          }

          const response = await retryWithBackoff(() =>
            this.throttledNotionCall(
              () => notion.databases.query(queryParams),
              'getTasksForCalendarView'
            )
          );

          allResults = allResults.concat(response.results);
          hasMore = response.has_more;
          startCursor = response.next_cursor || undefined;
          
          logger.debug(`Fetched ${response.results.length} tasks, total: ${allResults.length}, has_more: ${hasMore}`);
        }

        const allTasks = allResults
          .map(notionPageToTask)
          .filter(task => task.workPeriod?.startDate); // On garde les tâches même sans endDate

        // Filtrer pour ne garder que les tâches qui chevauchent la période demandée
        // Une tâche chevauche si : taskEnd >= startDate ET taskStart <= endDate
        const tasks = allTasks.filter(task => {
          // Vérifier que la date de début existe
          if (!task.workPeriod?.startDate) {
            return false;
          }
          
          const taskStart = new Date(task.workPeriod.startDate);
          // Maintenant que le mapper gère les tâches sans endDate, on devrait toujours avoir une endDate
          const taskEnd = task.workPeriod?.endDate 
            ? new Date(task.workPeriod.endDate)
            : new Date(taskStart); // Fallback au cas où
            
          const periodStart = new Date(startDate);
          const periodEnd = new Date(endDate);
          
          // La tâche chevauche la période si elle ne finit pas avant le début
          // ET ne commence pas après la fin
          return taskEnd >= periodStart && taskStart <= periodEnd;
        });

        logger.debug('Calendar tasks filtered', {
          totalTasks: allTasks.length,
          filteredTasks: tasks.length,
          startDate: startKey,
          endDate: endKey,
        });

        return tasks;
      },
      options
    );
  }

  /**
   * Preload cache for calendar navigation
   * Loads data for current window + adjacent periods for smooth lateral scrolling
   */
  async preloadCalendarCache(centerDate: Date = new Date()): Promise<void> {
    const ranges = [
      // Past 90 days
      {
        start: new Date(centerDate.getTime() - 90 * 24 * 60 * 60 * 1000),
        end: new Date(centerDate.getTime() - 1),
      },
      // Current month
      {
        start: new Date(centerDate.getFullYear(), centerDate.getMonth(), 1),
        end: new Date(centerDate.getFullYear(), centerDate.getMonth() + 1, 0),
      },
      // Next 365 days in 3-month chunks for better granularity
      {
        start: centerDate,
        end: new Date(centerDate.getTime() + 90 * 24 * 60 * 60 * 1000),
      },
      {
        start: new Date(centerDate.getTime() + 91 * 24 * 60 * 60 * 1000),
        end: new Date(centerDate.getTime() + 180 * 24 * 60 * 60 * 1000),
      },
      {
        start: new Date(centerDate.getTime() + 181 * 24 * 60 * 60 * 1000),
        end: new Date(centerDate.getTime() + 365 * 24 * 60 * 60 * 1000),
      },
    ];

    logger.info('Preloading calendar cache for optimal navigation...');

    // Load ranges in parallel for speed
    await Promise.all(
      ranges.map(range =>
        this.getTasksForCalendarView(range.start, range.end, { skipCache: false }).catch(err => {
          logger.error(
            `Failed to preload range ${range.start.toISOString()} to ${range.end.toISOString()}`,
            err
          );
        })
      )
    );

    logger.info('Calendar cache preload completed');
  }

  /**
   * Get tasks for a specific week
   */
  async getWeekTasks(weekStart: Date): Promise<NotionTask[]> {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    return this.getTasksForCalendarView(weekStart, weekEnd);
  }

  /**
   * Get tasks for a specific month
   */
  async getMonthTasks(year: number, month: number): Promise<NotionTask[]> {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    return this.getTasksForCalendarView(monthStart, monthEnd);
  }

  /**
   * Get tasks for a specific day
   */
  async getDayTasks(date: Date): Promise<NotionTask[]> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return this.getTasksForCalendarView(dayStart, dayEnd);
  }

  /**
   * Get upcoming tasks (next N days)
   */
  async getUpcomingTasks(days: number = 7): Promise<NotionTask[]> {
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + days);

    return this.getTasksForCalendarView(today, endDate);
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(): Promise<NotionTask[]> {
    const today = new Date();
    const pastDate = new Date();
    pastDate.setFullYear(today.getFullYear() - 1); // Look back 1 year max

    const tasks = await this.getTasksForCalendarView(pastDate, today);

    // Filter for incomplete tasks only
    return tasks.filter(
      task =>
        task.status !== 'completed' &&
        task.workPeriod?.endDate &&
        new Date(task.workPeriod.endDate) < today
    );
  }

  /**
   * Invalidate calendar cache for a specific date range
   */
  async invalidateCalendarCache(startDate?: Date, endDate?: Date): Promise<void> {
    if (startDate && endDate) {
      const startKey = startDate.toISOString().split('T')[0];
      const endKey = endDate.toISOString().split('T')[0];
      await cacheManagerService.deleteCacheKey(`tasks:calendar:start=${startKey}:end=${endKey}`);
    } else {
      // Invalidate all calendar caches
      await cacheManagerService.invalidateCachePattern('tasks:calendar:*');
    }
  }
}

// Export singleton instance
export const calendarService = new CalendarService();
