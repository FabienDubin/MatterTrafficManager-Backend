import { Request, Response } from "express";
import notionService from "../../services/notion.service";
import syncQueueService from "../../services/sync-queue.service";
import { redisService } from "../../services/redis.service";
import { tasksConflictService } from "../../services/tasks-conflict.service";

/**
 * Controller for deleting tasks
 */
export class TaskDeleteController {
  /**
   * Delete (archive) a task
   * DELETE /api/tasks/:id
   */
  deleteTask = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Task ID is required"
        });
      }

      const useAsync = req.query.async === 'true';

      if (useAsync) {
        // ASYNC MODE: Queue for background deletion
        const startTime = Date.now();
        
        await syncQueueService.queueTaskDelete(id);
        
        // Remove from cache immediately for optimistic update
        await redisService.del(`task:${id}`);
        
        // Delete conflicts for this task
        await tasksConflictService.deleteConflictsForTask(id);
        
        // Invalidate calendar cache
        await redisService.invalidatePattern('calendar:*');
        
        const queueTime = Date.now() - startTime;
        
        return res.status(200).json({
          success: true,
          message: "Task deletion queued",
          syncStatus: {
            synced: false,
            lastSync: new Date().toISOString(),
            conflicts: {
              hasConflicts: false
            },
            pending: true
          },
          meta: {
            timestamp: new Date().toISOString(),
            mode: 'async',
            queueTime: `${queueTime}ms`
          }
        });
      } else {
        // SYNC MODE: Direct Notion call
        const startTime = Date.now();
        
        // Archive task in Notion (soft delete)
        await notionService.archiveTask(id);
        
        const notionTime = Date.now() - startTime;

        // Remove from cache
        await redisService.del(`task:${id}`);

        // Invalidate calendar cache
        await redisService.invalidatePattern('calendar:*');

        return res.status(200).json({
          success: true,
          message: "Task archived successfully",
          syncStatus: {
            synced: true,
            lastSync: new Date().toISOString(),
            conflicts: {
              hasConflicts: false
            }
          },
          meta: {
            timestamp: new Date().toISOString(),
            mode: 'sync',
            notionTime: `${notionTime}ms`
          }
        });
      }
      
    } catch (error) {
      console.error("Error deleting task:", error);
      
      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          return res.status(404).json({
            success: false,
            error: "Task not found"
          });
        }
      }
      
      return res.status(500).json({
        success: false,
        error: "Failed to delete task"
      });
    }
  }
}

export const taskDeleteController = new TaskDeleteController();