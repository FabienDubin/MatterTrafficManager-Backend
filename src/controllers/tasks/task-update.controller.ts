import { Request, Response } from "express";
import notionService from "../../services/notion.service";
import syncQueueService from "../../services/sync-queue.service";
import { redisService } from "../../services/redis.service";
import { UpdateTaskInput } from "../../types/notion.types";
import { latencyMetricsService } from "../../services/latency-metrics.service";
import { tasksConflictService } from "../../services/tasks-conflict.service";
import { conflictDetectionService } from "../../services/conflict-detection.service";
import {
  updateTaskSchema,
  UpdateTaskInput as ValidatedUpdateTaskInput
} from "../../validators/tasks.validator";

/**
 * Controller for updating tasks
 */
export class TaskUpdateController {
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
        const currentTask = await redisService.get(`task:${id}`);
        const { conflicts: schedulingConflicts, method: conflictDetectionMethod } = await conflictDetectionService.detectUpdateConflictsAsync(id, updateData, currentTask);
        
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
        const currentTask = await redisService.get(`task:${id}`);
        const schedulingConflicts = await conflictDetectionService.detectUpdateConflictsSync(id, updateData, currentTask);
        
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
}

export const taskUpdateController = new TaskUpdateController();