import { Request, Response } from "express";
import notionService from "../../services/notion.service";
import { redisService } from "../../services/redis.service";
import { UpdateTaskInput } from "../../types/notion.types";
import { batchUpdateSchema } from "../../validators/tasks.validator";

/**
 * Controller for batch operations on tasks
 */
export class TasksBatchController {
  /**
   * Batch update tasks
   * POST /api/tasks/batch
   */
  async batchUpdateTasks(req: Request, res: Response) {
    try {
      // Validate request body
      const validation = batchUpdateSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request data",
          details: validation.error.errors
        });
      }

      const { updates } = validation.data;
      
      const results = {
        successful: [] as any[],
        failed: [] as any[],
      };

      // Process each update
      for (const update of updates) {
        try {
          const updatedTask = await notionService.updateTask(update.id, update.data as UpdateTaskInput);
          
          // Update cache
          await redisService.set(
            `task:${update.id}`,
            updatedTask,
            'task'
          );
          
          results.successful.push({
            id: update.id,
            data: updatedTask
          });
        } catch (error) {
          results.failed.push({
            id: update.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Invalidate calendar cache
      await redisService.invalidatePattern('calendar:*');

      const statusCode = results.failed.length > 0 ? 207 : 200; // Multi-status if partial failure

      return res.status(statusCode).json({
        success: results.failed.length === 0,
        data: {
          successful: results.successful,
          failed: results.failed,
          summary: {
            total: updates.length,
            succeeded: results.successful.length,
            failed: results.failed.length
          }
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error("Error in batch update:", error);
      
      return res.status(500).json({
        success: false,
        error: "Failed to process batch update"
      });
    }
  }
}

export const tasksBatchController = new TasksBatchController();