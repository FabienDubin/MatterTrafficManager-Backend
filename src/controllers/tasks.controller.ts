import { Request, Response } from "express";
import notionService from "../services/notion.service";
import { z } from "zod";
import { format, parseISO, isValid } from "date-fns";
import { redisService } from "../services/redis.service";
import { CreateTaskInput, UpdateTaskInput } from "../types/notion.types";

// Validation schema for query params
const calendarQuerySchema = z.object({
  startDate: z.string().refine((date) => {
    const parsed = parseISO(date);
    return isValid(parsed);
  }, "Invalid startDate format. Use ISO 8601 format (YYYY-MM-DD)"),
  endDate: z.string().refine((date) => {
    const parsed = parseISO(date);
    return isValid(parsed);
  }, "Invalid endDate format. Use ISO 8601 format (YYYY-MM-DD)")
});

// Validation schema for creating a task
const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  workPeriod: z.object({
    startDate: z.string().refine((date) => {
      const parsed = parseISO(date);
      return isValid(parsed);
    }, "Invalid startDate format"),
    endDate: z.string().refine((date) => {
      const parsed = parseISO(date);
      return isValid(parsed);
    }, "Invalid endDate format")
  }),
  assignedMembers: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  taskType: z.enum(['task', 'holiday', 'school', 'remote']).optional(),
  status: z.enum(['not_started', 'in_progress', 'completed']).optional(),
  notes: z.string().optional(),
  billedHours: z.number().optional(),
  actualHours: z.number().optional(),
  addToCalendar: z.boolean().optional(),
  clientPlanning: z.boolean().optional()
});

// Validation schema for updating a task
const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  workPeriod: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional()
  }).optional(),
  assignedMembers: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  taskType: z.enum(['task', 'holiday', 'school', 'remote']).optional(),
  status: z.enum(['not_started', 'in_progress', 'completed']).optional(),
  notes: z.string().optional(),
  billedHours: z.number().optional(),
  actualHours: z.number().optional(),
  addToCalendar: z.boolean().optional(),
  clientPlanning: z.boolean().optional(),
  version: z.number().optional() // For versioning
});

// Validation schema for batch updates
const batchUpdateSchema = z.object({
  updates: z.array(z.object({
    id: z.string(),
    data: updateTaskSchema
  }))
});

export class TasksController {
  /**
   * Get tasks for calendar view
   * GET /api/tasks/calendar?startDate=2025-01-01&endDate=2025-01-31
   */
  async getCalendarTasks(req: Request, res: Response) {
    try {
      // Validate query params
      const validation = calendarQuerySchema.safeParse(req.query);
      
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          details: validation.error.errors
        });
      }

      const { startDate, endDate } = validation.data;
      
      // Check date range is valid
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      
      if (start > end) {
        return res.status(400).json({
          success: false,
          error: "startDate must be before endDate"
        });
      }

      // Get tasks from service (will handle cache/Notion)
      // Convert string dates to Date objects
      const startDateObj = parseISO(startDate);
      const endDateObj = parseISO(endDate);
      
      const tasks = await notionService.getTasksForCalendarView(
        startDateObj,
        endDateObj
      );

      // Enrichir les données avec le batch resolver
      const { resolvedTasks } = await notionService.batchResolveRelations({
        tasks
      });

      // Format response avec les données enrichies
      return res.status(200).json({
        success: true,
        data: {
          tasks: resolvedTasks,
          cacheHit: true, // Calendar service uses cache by default
          period: {
            start: startDate,
            end: endDate
          }
        },
        meta: {
          count: resolvedTasks.length,
          cached: true,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error("Error fetching calendar tasks:", error);
      
      // Check if it's a known error type
      if (error instanceof Error) {
        if (error.message.includes("rate limit")) {
          return res.status(429).json({
            success: false,
            error: "Rate limit exceeded. Please try again later."
          });
        }
        
        if (error.message.includes("notion")) {
          return res.status(503).json({
            success: false,
            error: "Notion service temporarily unavailable"
          });
        }
      }
      
      // Generic error response
      return res.status(500).json({
        success: false,
        error: "Failed to fetch calendar tasks"
      });
    }
  }

  /**
   * Get a single task by ID
   * GET /api/tasks/:id
   */
  async getTaskById(req: Request, res: Response) {
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

      return res.status(200).json({
        success: true,
        data: task
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
   * Create a new task
   * POST /api/tasks
   */
  async createTask(req: Request, res: Response) {
    try {
      // Validate request body
      const validation = createTaskSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request data",
          details: validation.error.errors
        });
      }

      const taskData = validation.data;

      // Create task in Notion - cast to CreateTaskInput to handle optional types
      const createdTask = await notionService.createTask(taskData as CreateTaskInput);

      // Cache the new task
      await redisService.set(
        `task:${createdTask.id}`,
        createdTask,
        'task' // entity type
      );

      // Invalidate calendar cache for the period
      if (taskData.workPeriod) {
        await redisService.invalidatePattern('calendar:*');
      }

      return res.status(201).json({
        success: true,
        data: createdTask,
        meta: {
          cached: true,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error("Error creating task:", error);
      
      if (error instanceof Error) {
        if (error.message.includes("rate limit")) {
          return res.status(429).json({
            success: false,
            error: "Rate limit exceeded. Please try again later."
          });
        }
      }
      
      return res.status(500).json({
        success: false,
        error: "Failed to create task"
      });
    }
  }

  /**
   * Update an existing task
   * PUT /api/tasks/:id
   */
  async updateTask(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Task ID is required"
        });
      }

      // Validate request body
      const validation = updateTaskSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request data",
          details: validation.error.errors
        });
      }

      const updateData = validation.data;

      // Update task in Notion - cast to UpdateTaskInput to handle optional types
      const updatedTask = await notionService.updateTask(id, updateData as UpdateTaskInput);

      // Update cache
      await redisService.set(
        `task:${id}`,
        updatedTask,
        'task' // entity type
      );

      // Invalidate calendar cache if dates changed
      if (updateData.workPeriod) {
        await redisService.invalidatePattern('calendar:*');
      }

      return res.status(200).json({
        success: true,
        data: updatedTask,
        meta: {
          cached: true,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error("Error updating task:", error);
      
      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          return res.status(404).json({
            success: false,
            error: "Task not found"
          });
        }
        
        if (error.message.includes("rate limit")) {
          return res.status(429).json({
            success: false,
            error: "Rate limit exceeded. Please try again later."
          });
        }
      }
      
      return res.status(500).json({
        success: false,
        error: "Failed to update task"
      });
    }
  }

  /**
   * Delete (archive) a task
   * DELETE /api/tasks/:id
   */
  async deleteTask(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Task ID is required"
        });
      }

      // Archive task in Notion (soft delete)
      await notionService.archiveTask(id);

      // Remove from cache
      await redisService.del(`task:${id}`);

      // Invalidate calendar cache
      await redisService.invalidatePattern('calendar:*');

      return res.status(200).json({
        success: true,
        message: "Task archived successfully",
        meta: {
          timestamp: new Date().toISOString()
        }
      });
      
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

export const tasksController = new TasksController();