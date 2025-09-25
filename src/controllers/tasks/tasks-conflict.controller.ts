import { Request, Response } from "express";
import { tasksConflictService } from "../../services/tasks-conflict.service";
import { redisService } from "../../services/redis.service";

export interface SchedulingConflict {
  type: 'overlap' | 'holiday' | 'school' | 'overload';
  message: string;
  memberId: string;
  memberName?: string;
  conflictingTaskId?: string;
  conflictingTaskTitle?: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Controller for task scheduling conflict detection
 */
export class TasksConflictController {
  /**
   * Check conflicts for a specific task
   * GET /api/tasks/:id/conflicts
   */
  checkTaskConflicts = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Task ID is required"
        });
      }

      // Get task from cache
      const cacheKey = `task:${id}`;
      const task = await redisService.get(cacheKey);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: "Task not found"
        });
      }

      // Check scheduling conflicts
      const conflicts = await tasksConflictService.checkSchedulingConflicts(task);

      return res.status(200).json({
        success: true,
        data: {
          taskId: id,
          conflicts,
          hasConflicts: conflicts.length > 0
        }
      });
    } catch (error) {
      console.error('Error checking task conflicts:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to check task conflicts'
      });
    }
  };

  /**
   * Check conflicts for a task update (preview before save)
   * POST /api/tasks/conflicts/preview
   */
  previewConflicts = async (req: Request, res: Response) => {
    try {
      const taskData = req.body;
      
      if (!taskData.assignedMembers || !taskData.workPeriod) {
        return res.status(400).json({
          success: false,
          error: "assignedMembers and workPeriod are required"
        });
      }

      // Check what conflicts would occur with this data
      const conflicts = await tasksConflictService.checkSchedulingConflicts(taskData);

      return res.status(200).json({
        success: true,
        data: {
          conflicts,
          hasConflicts: conflicts.length > 0,
          severity: this.getMaxSeverity(conflicts)
        }
      });
    } catch (error) {
      console.error('Error previewing conflicts:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to preview conflicts'
      });
    }
  };

  /**
   * Get conflicts for multiple tasks (batch)
   * POST /api/tasks/conflicts/batch
   */
  batchCheckConflicts = async (req: Request, res: Response) => {
    try {
      const { taskIds } = req.body;
      
      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "taskIds array is required"
        });
      }

      const results: Record<string, SchedulingConflict[]> = {};
      
      // Check conflicts for each task
      await Promise.all(
        taskIds.map(async (taskId) => {
          try {
            const task = await redisService.get(`task:${taskId}`);
            if (task) {
              const conflicts = await tasksConflictService.checkSchedulingConflicts(task);
              results[taskId] = conflicts;
            }
          } catch (error) {
            console.error(`Error checking conflicts for task ${taskId}:`, error);
            results[taskId] = [];
          }
        })
      );

      return res.status(200).json({
        success: true,
        data: results
      });
    } catch (error) {
      console.error('Error batch checking conflicts:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to batch check conflicts'
      });
    }
  };

  /**
   * Get conflict statistics for a date range
   * GET /api/tasks/conflicts/stats
   */
  getConflictStats = async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: "startDate and endDate are required"
        });
      }

      // Get tasks from CACHE ONLY - no Notion API calls
      const cacheKey = `tasks:calendar:start=${startDate}:end=${endDate}`;
      const cachedTasks = await redisService.get(cacheKey);
      
      if (!cachedTasks || !Array.isArray(cachedTasks)) {
        // No cache available - return empty stats to avoid rate limit
        return res.status(200).json({
          success: true,
          data: {
            totalConflicts: 0,
            conflictsByType: {
              overlap: 0,
              holiday: 0,
              school: 0,
              overload: 0
            },
            membersWithConflictsCount: 0,
            dateRange: { startDate, endDate },
            warning: "No cached data available - stats will be updated on next sync"
          }
        });
      }
      
      const tasks = cachedTasks;

      let totalConflicts = 0;
      const conflictsByType: Record<string, number> = {
        overlap: 0,
        holiday: 0,
        school: 0,
        overload: 0
      };
      const membersWithConflicts = new Set<string>();

      // Check conflicts for each task
      for (const task of tasks) {
        const conflicts = await tasksConflictService.checkSchedulingConflicts(task);
        totalConflicts += conflicts.length;
        
        for (const conflict of conflicts) {
          if (!conflict) continue;
          
          const { type, memberId } = conflict;
          if (type && type in conflictsByType) {
            const count = conflictsByType[type];
            if (count !== undefined) {
              conflictsByType[type] = count + 1;
            }
          }
          if (memberId) {
            membersWithConflicts.add(memberId);
          }
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          totalConflicts,
          conflictsByType,
          membersWithConflictsCount: membersWithConflicts.size,
          dateRange: {
            startDate,
            endDate
          }
        }
      });
    } catch (error) {
      console.error('Error getting conflict stats:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get conflict statistics'
      });
    }
  };

  /**
   * Helper to get maximum severity from conflicts
   */
  private getMaxSeverity(conflicts: SchedulingConflict[]): 'low' | 'medium' | 'high' {
    if (conflicts.length === 0) return 'low';
    
    const severityOrder = { low: 0, medium: 1, high: 2 };
    const maxSeverity = conflicts.reduce((max, conflict) => {
      return severityOrder[conflict.severity] > severityOrder[max] ? conflict.severity : max;
    }, 'low' as 'low' | 'medium' | 'high');
    
    return maxSeverity;
  }
}

export const tasksConflictController = new TasksConflictController();