import { Request, Response } from "express";
import notionService from "../../services/notion.service";
import { tasksConflictService } from "../../services/tasks-conflict.service";

/**
 * Controller for reading tasks
 */
export class TaskReadController {
  /**
   * Get a single task by ID
   * GET /api/tasks/:id
   */
  getTaskById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Task ID is required"
        });
      }

      // Get from cache or Notion
      const task = await notionService.getTask(id);

      if (!task) {
        return res.status(404).json({
          success: false,
          error: "Task not found"
        });
      }

      // Add sync status with conflict info
      const syncStatus = await tasksConflictService.getSyncStatus(id, 'task');

      // Check scheduling conflicts - now using CACHE ONLY
      const schedulingConflicts = await tasksConflictService.checkSchedulingConflicts(task);

      return res.status(200).json({
        success: true,
        data: task,
        syncStatus,
        conflicts: schedulingConflicts
      });

    } catch (error) {
      console.error("Error fetching task:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch task"
      });
    }
  }

  /**
   * Get unplanned tasks (tasks without startDate) with caching
   * GET /api/v1/tasks/unplanned
   */
  getUnplannedTasks = async (_req: Request, res: Response) => {
    try {
      // Import required services
      const { cacheManagerService } = await import('../../services/notion/cache-manager.service');
      const { notion, DATABASES } = await import('../../config/notion.config');
      const { notionPageToTask } = await import('../../mappers/notion.mapper');
      const { retryWithBackoff } = await import('../../utils/retryWithBackoff');

      const cacheKey = 'tasks:unplanned:all';

      const unplannedTasks = await cacheManagerService.getCachedOrFetch(
        cacheKey,
        'tasks',
        async () => {
          // Query Notion database for tasks without workPeriod or without startDate
          let allResults: any[] = [];
          let hasMore = true;
          let startCursor: string | undefined = undefined;

          while (hasMore) {
            const queryParams: any = {
              database_id: DATABASES.traffic,
              // Filter for tasks where workPeriod is empty (not set)
              filter: {
                property: 'Période de travail', // workPeriod property name
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

            allResults = allResults.concat(response.results);
            hasMore = response.has_more;
            startCursor = response.next_cursor || undefined;
          }

          // Map Notion pages to tasks
          return allResults.map(notionPageToTask);
        }
      );

      return res.status(200).json({
        success: true,
        data: {
          tasks: unplannedTasks,
          count: unplannedTasks.length
        },
        meta: {
          timestamp: new Date().toISOString(),
          cached: true
        }
      });
    } catch (error) {
      console.error('Error fetching unplanned tasks:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch unplanned tasks'
      });
    }
  }
}

export const taskReadController = new TaskReadController();