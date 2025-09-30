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
}

export const taskReadController = new TaskReadController();