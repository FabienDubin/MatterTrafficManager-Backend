import { Request, Response } from "express";
import notionService from "../../services/notion.service";
import syncQueueService from "../../services/sync-queue.service";
import { redisService } from "../../services/redis.service";
import { CreateTaskInput } from "../../types/notion.types";
import { latencyMetricsService } from "../../services/latency-metrics.service";
import { tasksConflictService } from "../../services/tasks-conflict.service";
import { conflictDetectionService } from "../../services/conflict-detection.service";
import {
  createTaskSchema,
  CreateTaskInput as ValidatedCreateTaskInput
} from "../../validators/tasks.validator";

/**
 * Controller for creating tasks
 */
export class TaskCreateController {
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
        const schedulingConflicts = await conflictDetectionService.detectCreateConflicts(taskData);
        
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
}

export const taskCreateController = new TaskCreateController();