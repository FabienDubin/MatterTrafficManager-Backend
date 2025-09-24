import { Request, Response } from "express";
import notionService from "../services/notion.service";
import syncQueueService from "../services/sync-queue.service";
import { z } from "zod";
import { parseISO, isValid } from "date-fns";
import { redisService } from "../services/redis.service";
import { CreateTaskInput, UpdateTaskInput } from "../types/notion.types";
import { latencyMetricsService } from "../services/latency-metrics.service";
import { ConflictLogModel } from "../models/ConflictLog.model";
import { conflictService } from "../services/conflict.service";

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
  // Optimistic update fields
  expectedUpdatedAt: z.string().optional(), // ISO date de last_edited_time pour détecter conflits
  force: z.boolean().optional() // Force l'update même en cas de conflit
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
   * Helper to check for conflicts and build syncStatus
   */
  private async getSyncStatus(entityId: string, entityType: string = 'task') {
    try {
      // Check for pending conflicts
      const pendingConflicts = await ConflictLogModel.find({
        entityId,
        entityType,
        resolution: 'pending'
      }).sort({ detectedAt: -1 }).limit(1);

      const hasConflicts = pendingConflicts.length > 0;
      const latestConflict = pendingConflicts[0];

      return {
        synced: !hasConflicts,
        lastSync: new Date().toISOString(),
        conflicts: hasConflicts && latestConflict ? {
          hasConflicts: true,
          conflictId: latestConflict._id?.toString(),
          severity: latestConflict.severity || 'medium',
          detectedAt: latestConflict.detectedAt
        } : {
          hasConflicts: false
        }
      };
    } catch (error) {
      console.error('Error checking conflicts:', error);
      return {
        synced: true,
        lastSync: new Date().toISOString(),
        conflicts: {
          hasConflicts: false
        }
      };
    }
  }
  /**
   * Get tasks for calendar view
   * GET /api/tasks/calendar?startDate=2025-01-01&endDate=2025-01-31
   */
  getCalendarTasks = async (req: Request, res: Response) => {
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

      // Check for conflicts in each task during polling
      const tasksWithSyncStatus = await Promise.all(
        resolvedTasks.map(async (task: any) => {
          const syncStatus = await this.getSyncStatus(task.id, 'task');
          return {
            ...task,
            syncStatus
          };
        })
      );

      // Check if any task has conflicts
      const hasAnyConflicts = tasksWithSyncStatus.some(
        task => task.syncStatus?.conflicts?.hasConflicts
      );

      // Format response avec les données enrichies et syncStatus
      return res.status(200).json({
        success: true,
        data: {
          tasks: tasksWithSyncStatus,
          cacheHit: true, // Calendar service uses cache by default
          period: {
            start: startDate,
            end: endDate
          },
          syncStatus: {
            synced: !hasAnyConflicts,
            lastSync: new Date().toISOString(),
            hasConflicts: hasAnyConflicts,
            conflictCount: tasksWithSyncStatus.filter(
              t => t.syncStatus?.conflicts?.hasConflicts
            ).length
          }
        },
        meta: {
          count: tasksWithSyncStatus.length,
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
      const syncStatus = await this.getSyncStatus(id, 'task');

      return res.status(200).json({
        success: true,
        data: {
          ...task,
          syncStatus
        }
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
  createTask = async (req: Request, res: Response) => {
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
      const useAsync = req.query.async === 'true';

      if (useAsync) {
        // ASYNC MODE: Queue for background sync (< 100ms)
        const startTime = Date.now();
        
        // Queue the creation and get temp ID
        const { id: tempId } = await syncQueueService.queueTaskCreate(taskData as CreateTaskInput);
        
        // Create optimistic response
        const optimisticTask = {
          id: tempId,
          ...taskData,
          _temporary: true,
          _pendingSync: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const queueTime = Date.now() - startTime;
        
        // Record metrics
        latencyMetricsService.recordRedisLatency(queueTime, 'task-create-queue');
        
        // Invalidate calendar cache
        if (taskData.workPeriod) {
          await redisService.invalidatePattern('calendar:*');
        }

        return res.status(201).json({
          success: true,
          data: optimisticTask,
          syncStatus: {
            synced: false,
            lastSync: new Date().toISOString(),
            conflicts: {
              hasConflicts: false
            },
            pending: true
          },
          meta: {
            cached: true,
            timestamp: new Date().toISOString(),
            mode: 'async',
            queueTime: `${queueTime}ms`,
            tempId: tempId
          }
        });
        
      } else {
        // SYNC MODE: Direct Notion call (current behavior)
        const startTime = Date.now();
        
        const createdTask = await notionService.createTask(taskData as CreateTaskInput);
        
        const notionTime = Date.now() - startTime;
        
        // Record metrics
        latencyMetricsService.recordNotionLatency(notionTime, 'task-create-sync');

        // Cache the new task
        await redisService.set(
          `task:${createdTask.id}`,
          createdTask,
          'task'
        );

        // Invalidate calendar cache
        if (taskData.workPeriod) {
          await redisService.invalidatePattern('calendar:*');
        }

        // Get sync status for the newly created task
        const syncStatus = await this.getSyncStatus(createdTask.id, 'task');

        return res.status(201).json({
          success: true,
          data: {
            ...createdTask,
            updatedAt: createdTask.updatedAt?.toISOString()
          },
          syncStatus,
          meta: {
            cached: true,
            timestamp: new Date().toISOString(),
            mode: 'sync',
            notionTime: `${notionTime}ms`
          }
        });
      }
      
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
   * Update an existing task with optimistic update support
   * PUT /api/tasks/:id
   */
  updateTask = async (req: Request, res: Response) => {
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

      const { expectedUpdatedAt, force, ...updateData } = validation.data;
      const useAsync = req.query.async === 'true';

      // Si expectedUpdatedAt est fourni, vérifier les conflits
      if (expectedUpdatedAt && !force && !useAsync) {
        try {
          // Récupérer la tâche actuelle depuis Notion
          const currentTask = await notionService.getTask(id);
          
          if (currentTask) {
            const currentUpdatedAt = currentTask.updatedAt?.toISOString();
            
            // Comparer les timestamps
            if (currentUpdatedAt && currentUpdatedAt !== expectedUpdatedAt) {
              return res.status(409).json({
                success: false,
                error: "Conflict detected",
                conflict: {
                  type: "version_mismatch",
                  expected: expectedUpdatedAt,
                  current: currentUpdatedAt,
                  message: "The task has been modified since you last fetched it"
                },
                data: currentTask // Renvoyer la version actuelle pour que le client puisse résoudre
              });
            }
          }
        } catch (error) {
          // Si on ne peut pas récupérer la tâche, continuer avec l'update
          console.warn(`Could not fetch task for conflict detection: ${error}`);
        }
      }

      if (useAsync) {
        // ASYNC MODE: Queue for background sync
        const startTime = Date.now();
        
        // Queue the update
        await syncQueueService.queueTaskUpdate(id, updateData as UpdateTaskInput);
        
        // Get cached version for optimistic response
        const cachedTask = await redisService.get(`task:${id}`) || {};
        
        const optimisticTask = {
          ...cachedTask,
          ...updateData,
          id,
          _pendingSync: true,
          updatedAt: new Date().toISOString()
        };
        
        const queueTime = Date.now() - startTime;
        
        // Record metrics
        latencyMetricsService.recordRedisLatency(queueTime, 'task-update-queue');
        
        // Invalidate calendar cache if dates changed
        if (updateData.workPeriod) {
          await redisService.invalidatePattern('calendar:*');
        }

        return res.status(200).json({
          success: true,
          data: optimisticTask,
          syncStatus: {
            synced: false,
            lastSync: new Date().toISOString(),
            conflicts: {
              hasConflicts: false
            },
            pending: true
          },
          meta: {
            cached: true,
            timestamp: new Date().toISOString(),
            version: optimisticTask.updatedAt,
            mode: 'async',
            queueTime: `${queueTime}ms`
          }
        });
        
      } else {
        // SYNC MODE: Direct Notion call
        const startTime = Date.now();
        
        const updatedTask = await notionService.updateTask(id, updateData as UpdateTaskInput);
        
        const notionTime = Date.now() - startTime;
        
        // Record metrics
        latencyMetricsService.recordNotionLatency(notionTime, 'task-update-sync');

        // Update cache
        await redisService.set(
          `task:${id}`,
          updatedTask,
          'task'
        );

        // Invalidate calendar cache if dates changed
        if (updateData.workPeriod) {
          await redisService.invalidatePattern('calendar:*');
        }

        // Get sync status after update
        const syncStatus = await this.getSyncStatus(id, 'task');

        return res.status(200).json({
          success: true,
          data: {
            ...updatedTask,
            updatedAt: updatedTask.updatedAt?.toISOString()
          },
          syncStatus,
          meta: {
            cached: true,
            timestamp: new Date().toISOString(),
            version: updatedTask.updatedAt?.toISOString(),
            mode: 'sync',
            notionTime: `${notionTime}ms`
          }
        });
      }
      
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
}

export const tasksController = new TasksController();