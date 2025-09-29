import { Request, Response } from "express";
import notionService from "../../services/notion.service";
import syncQueueService from "../../services/sync-queue.service";
import { parseISO } from "date-fns";
import { redisService } from "../../services/redis.service";
import { CreateTaskInput, UpdateTaskInput } from "../../types/notion.types";
import { latencyMetricsService } from "../../services/latency-metrics.service";
import { tasksConflictService } from "../../services/tasks-conflict.service";
import { notionRateLimiter } from "../../middleware/rate-limit.middleware";
import {
  createTaskSchema,
  updateTaskSchema,
  CreateTaskInput as ValidatedCreateTaskInput,
  UpdateTaskInput as ValidatedUpdateTaskInput
} from "../../validators/tasks.validator";

/**
 * Controller for CRUD operations on tasks
 */
export class TasksCrudController {
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
        // SYNC MODE: Direct Notion call with HYBRID conflict detection
        const startTime = Date.now();
        
        // HYBRID CONFLICT DETECTION for CREATE
        let schedulingConflicts: any[] = [];
        
        if (taskData.workPeriod?.startDate && 
            taskData.workPeriod?.endDate && 
            taskData.assignedMembers && 
            taskData.assignedMembers.length > 0) {
          
          console.log('[CREATE CONFLICT] Starting hybrid conflict detection...');
          
          // Try cache first
          const cacheKey = `tasks:calendar:start=2025-08-26:end=2025-10-25`;
          const cachedTasks = await redisService.get(cacheKey);
          
          if (cachedTasks && Array.isArray(cachedTasks)) {
            console.log(`[CREATE CONFLICT] Using cache: ${cachedTasks.length} tasks found`);
            
            // Filter for relevant tasks
            const relevantTasks = cachedTasks.filter((task: any) => 
              task.assignedMembers && 
              task.assignedMembers.some((m: string) => 
                taskData.assignedMembers?.includes(m)
              )
            );
            
            schedulingConflicts = await tasksConflictService.checkSchedulingConflictsWithTasks(
              taskData as any,
              relevantTasks
            );
            
          } else {
            console.log('[CREATE CONFLICT] Cache empty, fetching from Notion...');
            
            // HYBRID: Direct Notion query for specific members WITH RATE LIMITING
            try {
              console.log('[CREATE CONFLICT] Using rate-limited Notion fallback...');
              
              const memberTasks = await notionRateLimiter.scheduleHighPriority(async () => {
                console.log('[CREATE CONFLICT] Executing Notion query through rate limiter...');
                return notionService.getTasksForCalendarView(
                  new Date(taskData.workPeriod.startDate),
                  new Date(taskData.workPeriod.endDate)
                );
              });
              
              // Filter for members
              const relevantTasks = memberTasks.filter((task: any) =>
                task.assignedMembers && 
                task.assignedMembers.some((m: string) => 
                  taskData.assignedMembers?.includes(m)
                )
              );
              
              console.log(`[CREATE CONFLICT] Found ${relevantTasks.length} relevant tasks from Notion`);
              
              schedulingConflicts = await tasksConflictService.checkSchedulingConflictsWithTasks(
                taskData as any,
                relevantTasks
              );
              
            } catch (error) {
              console.error('[CREATE CONFLICT] Error fetching from Notion:', error);
              // Continue without conflicts
            }
          }
        }
        
        // Now create the task
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

        // Invalidate calendar cache AFTER conflict check
        if (taskData.workPeriod) {
          await redisService.invalidatePattern('calendar:*');
        }

        // Save conflicts to MongoDB for persistence
        if (schedulingConflicts && schedulingConflicts.length > 0) {
          await tasksConflictService.saveConflicts(createdTask.id, schedulingConflicts);
        }

        // Get sync status for the newly created task
        const syncStatus = await tasksConflictService.getSyncStatus(createdTask.id, 'task');

        return res.status(201).json({
          success: true,
          data: {
            ...createdTask,
            updatedAt: createdTask.updatedAt?.toISOString()
          },
          syncStatus,
          conflicts: schedulingConflicts,
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
        // ASYNC MODE: Queue for background sync with conflict detection
        const startTime = Date.now();
        
        // DÉTECTION DE CONFLITS (même en mode async)
        let schedulingConflicts: any[] = [];
        let conflictDetectionMethod = 'none';
        
        // Only check conflicts if we're updating dates or members
        if (updateData.workPeriod || updateData.assignedMembers) {
          // Build what the updated task will look like
          const currentTask = await redisService.get(`task:${id}`);
          const taskForConflictCheck = currentTask ? {
            ...currentTask,
            ...updateData,
            id
          } : {
            ...updateData,
            id
          };
          
          // If we have work period and assigned members
          if (taskForConflictCheck.workPeriod?.startDate && 
              taskForConflictCheck.workPeriod?.endDate && 
              taskForConflictCheck.assignedMembers && 
              taskForConflictCheck.assignedMembers.length > 0) {
            
            console.log('[ASYNC CONFLICT CHECK] Capturing tasks for conflict detection...');
            
            const membersToCheck = taskForConflictCheck.assignedMembers;
            const relevantTasks: any[] = [];
            
            try {
              // 1. D'ABORD essayer le cache Redis
              const cacheKey = `tasks:calendar:start=2025-08-26:end=2025-10-25`;
              const cachedTasks = await redisService.get(cacheKey);
              
              if (cachedTasks && Array.isArray(cachedTasks)) {
                console.log(`[ASYNC CONFLICT CHECK] Using cached tasks: ${cachedTasks.length} total tasks`);
                conflictDetectionMethod = 'cache';
                
                // Filter for tasks with overlapping members
                for (const task of cachedTasks) {
                  if (task.id !== id && 
                      task.assignedMembers && 
                      membersToCheck &&
                      task.assignedMembers.some((m: string) => membersToCheck.includes(m))) {
                    relevantTasks.push(task);
                  }
                }
                
                console.log(`[ASYNC CONFLICT CHECK] Found ${relevantTasks.length} relevant tasks for conflict check`);
              } else {
                // 2. SI PAS DE CACHE → Approche HYBRIDE avec Notion + rate limiter
                console.log('[ASYNC CONFLICT CHECK] No cache available, using HYBRID approach...');
                conflictDetectionMethod = 'notion-hybrid';
                
                try {
                  console.log('[ASYNC CONFLICT CHECK] Using rate-limited Notion fallback...');
                  
                  const memberTasks = await notionRateLimiter.scheduleHighPriority(async () => {
                    console.log('[ASYNC CONFLICT CHECK] Executing Notion query through rate limiter...');
                    const startDate = taskForConflictCheck.workPeriod?.startDate || new Date().toISOString();
                    const endDate = taskForConflictCheck.workPeriod?.endDate || new Date().toISOString();
                    return notionService.getTasksForCalendarView(
                      new Date(startDate),
                      new Date(endDate)
                    );
                  });
                  
                  // Filter for relevant members
                  for (const task of memberTasks) {
                    if (task.id !== id && 
                        task.assignedMembers && 
                        membersToCheck &&
                        task.assignedMembers.some((m: string) => membersToCheck.includes(m))) {
                      relevantTasks.push(task);
                    }
                  }
                  
                  console.log(`[ASYNC CONFLICT CHECK] Found ${relevantTasks.length} relevant tasks from Notion`);
                  console.log('[ASYNC CONFLICT CHECK] Rate limiter stats:', notionRateLimiter.getStats());
                  
                } catch (error) {
                  console.error('[ASYNC CONFLICT CHECK] Error fetching from Notion:', error);
                  // Continue without conflicts
                }
              }
              
              // 3. Détecter les conflits avec les tâches capturées
              schedulingConflicts = await tasksConflictService.checkSchedulingConflictsWithTasks(
                taskForConflictCheck as any,
                relevantTasks
              );
              
            } catch (error) {
              console.error('[ASYNC CONFLICT CHECK] Error capturing tasks for conflict detection:', error);
              // Continue without conflicts rather than failing the update
            }
          }
          
          console.log('[ASYNC CONFLICT CHECK] Found conflicts:', schedulingConflicts);
        }
        
        // Save conflicts to MongoDB for persistence
        if (schedulingConflicts && schedulingConflicts.length > 0) {
          await tasksConflictService.saveConflicts(id, schedulingConflicts);
        } else {
          // Clear any existing conflicts if none detected
          await tasksConflictService.resolveConflictsForTask(id);
        }
        
        // Queue the update (après la détection de conflits)
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
        
        // Save conflicts to MongoDB if any were detected
        if (schedulingConflicts && schedulingConflicts.length > 0) {
          await tasksConflictService.saveConflicts(id, schedulingConflicts);
          console.log(`[ASYNC UPDATE] Saved ${schedulingConflicts.length} conflicts to MongoDB for task ${id}`);
        } else if (updateData.workPeriod || updateData.assignedMembers) {
          // If we updated dates/members but no conflicts, clear any existing ones
          await tasksConflictService.resolveConflictsForTask(id);
          console.log(`[ASYNC UPDATE] Cleared conflicts for task ${id} (no conflicts detected)`);
        }

        // Invalidate calendar cache if dates changed (APRÈS la détection de conflits)
        if (updateData.workPeriod) {
          await redisService.invalidatePattern('calendar:*');
        }

        return res.status(200).json({
          success: true,
          data: optimisticTask,
          conflicts: schedulingConflicts, // Ajouter les conflits détectés
          syncStatus: {
            synced: false,
            lastSync: new Date().toISOString(),
            conflicts: {
              hasConflicts: schedulingConflicts.length > 0, // Basé sur la détection réelle
              count: schedulingConflicts.length // Nombre de conflits
            },
            pending: true
          },
          meta: {
            cached: true,
            timestamp: new Date().toISOString(),
            version: optimisticTask.updatedAt,
            mode: 'async',
            queueTime: `${queueTime}ms`,
            conflictDetectionMethod, // Pour debug
            conflictsDetected: schedulingConflicts.length // Nombre de conflits
          }
        });
        
      } else {
        // SYNC MODE: Direct Notion call
        const startTime = Date.now();
        
        // IMPORTANT: Check conflicts BEFORE any cache invalidation!
        let schedulingConflicts: any[] = [];
        
        // Only check conflicts if we're updating dates or members
        if (updateData.workPeriod || updateData.assignedMembers) {
          // Build what the updated task will look like
          const currentTask = await redisService.get(`task:${id}`);
          const taskForConflictCheck = currentTask ? {
            ...currentTask,
            ...updateData,
            id
          } : {
            ...updateData,
            id
          };
          
          // If we have work period and assigned members, capture relevant tasks BEFORE cache invalidation
          if (taskForConflictCheck.workPeriod?.startDate && 
              taskForConflictCheck.workPeriod?.endDate && 
              taskForConflictCheck.assignedMembers && 
              taskForConflictCheck.assignedMembers.length > 0) {
            
            console.log('[CONFLICT CHECK] Capturing tasks for conflict detection...');
            
            // Get tasks for these specific members from Notion directly (targeted query)
            // This is a small, targeted request that shouldn't hit rate limits
            const membersToCheck = taskForConflictCheck.assignedMembers;
            const relevantTasks: any[] = [];
            
            try {
              // Get all tasks and filter for relevant ones
              // We'll use the existing calendar cache if available
              const cacheKey = `tasks:calendar:start=2025-08-26:end=2025-10-25`;
              const cachedTasks = await redisService.get(cacheKey);
              
              if (cachedTasks && Array.isArray(cachedTasks)) {
                console.log(`[CONFLICT CHECK] Using cached tasks: ${cachedTasks.length} total tasks`);
                
                // Filter for tasks with overlapping members
                for (const task of cachedTasks) {
                  if (task.id !== id && // Not the same task
                      task.assignedMembers && 
                      membersToCheck &&
                      task.assignedMembers.some((m: string) => membersToCheck.includes(m))) {
                    relevantTasks.push(task);
                  }
                }
                
                console.log(`[CONFLICT CHECK] Found ${relevantTasks.length} relevant tasks for conflict check`);
              } else {
                console.log('[CONFLICT CHECK] No cache available, using HYBRID approach...');
                
                // HYBRID: Direct Notion query for specific period WITH RATE LIMITING
                try {
                  console.log('[CONFLICT CHECK] Using rate-limited Notion fallback...');
                  
                  const memberTasks = await notionRateLimiter.scheduleHighPriority(async () => {
                    console.log('[CONFLICT CHECK] Executing Notion query through rate limiter...');
                    // We already checked workPeriod exists above
                    const startDate = taskForConflictCheck.workPeriod?.startDate || new Date().toISOString();
                    const endDate = taskForConflictCheck.workPeriod?.endDate || new Date().toISOString();
                    return notionService.getTasksForCalendarView(
                      new Date(startDate),
                      new Date(endDate)
                    );
                  });
                  
                  // Filter for relevant members
                  for (const task of memberTasks) {
                    if (task.id !== id && // Not the same task
                        task.assignedMembers && 
                        membersToCheck &&
                        task.assignedMembers.some((m: string) => membersToCheck.includes(m))) {
                      relevantTasks.push(task);
                    }
                  }
                  
                  console.log(`[CONFLICT CHECK] Found ${relevantTasks.length} relevant tasks from Notion`);
                  console.log('[CONFLICT CHECK] Rate limiter stats:', notionRateLimiter.getStats());
                  
                } catch (error) {
                  console.error('[CONFLICT CHECK] Error fetching from Notion:', error);
                  // Continue without conflicts
                }
              }
              
              // Now check conflicts with the captured tasks
              schedulingConflicts = await tasksConflictService.checkSchedulingConflictsWithTasks(
                taskForConflictCheck as any,
                relevantTasks
              );
              
            } catch (error) {
              console.error('[CONFLICT CHECK] Error capturing tasks for conflict detection:', error);
              // Continue without conflicts rather than failing the update
            }
          }
          
          console.log('[CONFLICT CHECK] Found conflicts:', schedulingConflicts);
        }
        
        // Now perform the actual update
        const updatedTask = await notionService.updateTask(id, updateData as UpdateTaskInput);
        
        const notionTime = Date.now() - startTime;
        
        // Record metrics
        latencyMetricsService.recordNotionLatency(notionTime, 'task-update-sync');

        // Save conflicts to MongoDB if any were detected
        if (schedulingConflicts && schedulingConflicts.length > 0) {
          await tasksConflictService.saveConflicts(id, schedulingConflicts);
          console.log(`[SYNC UPDATE] Saved ${schedulingConflicts.length} conflicts to MongoDB for task ${id}`);
        } else if (updateData.workPeriod || updateData.assignedMembers) {
          // If we updated dates/members but no conflicts, clear any existing ones
          await tasksConflictService.resolveConflictsForTask(id);
          console.log(`[SYNC UPDATE] Cleared conflicts for task ${id} (no conflicts detected)`);
        }

        // Update cache
        await redisService.set(
          `task:${id}`,
          updatedTask,
          'task'
        );

        // Invalidate calendar cache if dates changed (AFTER conflict check)
        if (updateData.workPeriod) {
          await redisService.invalidatePattern('calendar:*');
        }

        // Get sync status after update
        const syncStatus = await tasksConflictService.getSyncStatus(id, 'task');

        return res.status(200).json({
          success: true,
          data: {
            ...updatedTask,
            updatedAt: updatedTask.updatedAt?.toISOString()
          },
          syncStatus,
          conflicts: schedulingConflicts, // Use conflicts checked BEFORE cache invalidation
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

export const tasksCrudController = new TasksCrudController();