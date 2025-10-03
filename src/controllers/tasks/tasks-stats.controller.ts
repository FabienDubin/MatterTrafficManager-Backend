import { Request, Response } from "express";
import notionService from "../../services/notion.service";

/**
 * Controller for task statistics and metrics
 */
export class TasksStatsController {
  /**
   * Get today's tasks statistics
   * GET /api/v1/tasks/stats/today
   */
  async getTodayStats(_req: Request, res: Response) {
    try {
      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      // Fetch tasks for today
      const tasks = await notionService.getTasksForCalendarView(
        startOfDay,
        endOfDay
      );

      // Calculate statistics based on workPeriod
      const todaysTasks = tasks.filter(task => {
        if (!task.workPeriod || !task.workPeriod.startDate || !task.workPeriod.endDate) {
          return false;
        }
        const startDate = new Date(task.workPeriod.startDate);
        const endDate = new Date(task.workPeriod.endDate);
        return startDate <= endOfDay && endDate >= startOfDay;
      });

      const stats = {
        total: todaysTasks.length,
        completed: todaysTasks.filter(t => t.status === 'completed').length,
        inProgress: todaysTasks.filter(t => t.status === 'in_progress').length,
        notStarted: todaysTasks.filter(t => t.status === 'not_started').length,
        byType: {
          task: todaysTasks.filter(t => t.taskType === 'task').length,
          holiday: todaysTasks.filter(t => t.taskType === 'holiday').length,
          school: todaysTasks.filter(t => t.taskType === 'school').length,
          remote: todaysTasks.filter(t => t.taskType === 'remote').length
        }
      };

      return res.status(200).json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching today's stats:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch today's statistics"
      });
    }
  }

  /**
   * Get count of unplanned tasks (tasks without startDate) - for dashboard stats
   * GET /api/v1/tasks/unplanned/count
   */
  async getUnplannedCount(_req: Request, res: Response) {
    try {
      // Import required services
      const { cacheManagerService } = await import('../../services/notion/cache-manager.service');
      const { notion, DATABASES } = await import('../../config/notion.config');
      const { retryWithBackoff } = await import('../../utils/retryWithBackoff');

      const cacheKey = 'tasks:unplanned:count';

      const count = await cacheManagerService.getCachedOrFetch(
        cacheKey,
        'tasks',
        async () => {
          // Query Notion database for tasks without workPeriod
          let totalCount = 0;
          let hasMore = true;
          let startCursor: string | undefined = undefined;

          while (hasMore) {
            const queryParams: any = {
              database_id: DATABASES.traffic,
              filter: {
                property: 'Période de travail',
                date: {
                  is_empty: true
                }
              },
              page_size: 100
            };

            if (startCursor) {
              queryParams.start_cursor = startCursor;
            }

            const response = await retryWithBackoff(() =>
              notion.databases.query(queryParams)
            );

            totalCount += response.results.length;
            hasMore = response.has_more;
            startCursor = response.next_cursor || undefined;
          }

          return totalCount;
        }
      );

      return res.status(200).json({
        success: true,
        data: {
          count
        },
        meta: {
          timestamp: new Date().toISOString(),
          cached: true
        }
      });
    } catch (error) {
      console.error('Error fetching unplanned tasks count:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch unplanned tasks count'
      });
    }
  }
}

export const tasksStatsController = new TasksStatsController();