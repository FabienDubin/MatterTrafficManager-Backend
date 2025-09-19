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

  /**
   * Preload cache for calendar navigation
   * Loads data for current window + adjacent periods for smooth lateral scrolling
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
    return tasks.filter(task => 
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