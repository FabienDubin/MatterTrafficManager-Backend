import { Request, Response } from "express";
import { tasksConflictService } from "../../services/tasks-conflict.service";
import { redisService } from "../../services/redis.service";
import { notionRateLimiter } from "../../middleware/rate-limit.middleware";
import notionService from "../../services/notion.service";

/**
 * Controller for conflict detection operations
 */
export class TaskConflictController {
  /**
   * Check scheduling conflicts for a new task
   * POST /api/tasks/check-conflicts
   */
  checkSchedulingConflicts = async (req: Request, res: Response) => {
    try {
      const taskData = req.body;
      
      if (!taskData.workPeriod?.startDate || 
          !taskData.workPeriod?.endDate || 
          !taskData.assignedMembers || 
          taskData.assignedMembers.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Task must have work period and assigned members for conflict detection"
        });
      }

      console.log('[CONFLICT CHECK] Starting conflict detection...');
      
      // Try cache first
      const cacheKey = `tasks:calendar:start=2025-08-26:end=2025-10-25`;
      const cachedTasks = await redisService.get(cacheKey);
      
      let schedulingConflicts: any[] = [];
      
      if (cachedTasks && Array.isArray(cachedTasks)) {
        console.log(`[CONFLICT CHECK] Using cache: ${cachedTasks.length} tasks found`);
        
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
        console.log('[CONFLICT CHECK] Cache empty, fetching from Notion...');
        
        // HYBRID: Direct Notion query for specific members WITH RATE LIMITING
        try {
          console.log('[CONFLICT CHECK] Using rate-limited Notion fallback...');
          
          const memberTasks = await notionRateLimiter.scheduleHighPriority(async () => {
            console.log('[CONFLICT CHECK] Executing Notion query through rate limiter...');
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
          
          console.log(`[CONFLICT CHECK] Found ${relevantTasks.length} relevant tasks from Notion`);
          
          schedulingConflicts = await tasksConflictService.checkSchedulingConflictsWithTasks(
            taskData as any,
            relevantTasks
          );
          
        } catch (error) {
          console.error('[CONFLICT CHECK] Error fetching from Notion:', error);
          // Continue without conflicts
        }
      }

      return res.status(200).json({
        success: true,
        conflicts: schedulingConflicts,
        meta: {
          timestamp: new Date().toISOString(),
          conflictsFound: schedulingConflicts.length
        }
      });
      
    } catch (error) {
      console.error("Error checking scheduling conflicts:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to check scheduling conflicts"
      });
    }
  }

  /**
   * Check update conflicts for an existing task
   * POST /api/tasks/:id/check-update-conflicts
   */
  checkUpdateConflicts = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Task ID is required"
        });
      }

      // Only check conflicts if we're updating dates or members
      if (!updateData.workPeriod && !updateData.assignedMembers) {
        return res.status(200).json({
          success: true,
          conflicts: [],
          meta: {
            timestamp: new Date().toISOString(),
            conflictsFound: 0,
            message: "No date or member changes - no conflicts possible"
          }
        });
      }

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
      
      let schedulingConflicts: any[] = [];
      
      // If we have work period and assigned members, capture relevant tasks BEFORE cache invalidation
      if (taskForConflictCheck.workPeriod?.startDate && 
          taskForConflictCheck.workPeriod?.endDate && 
          taskForConflictCheck.assignedMembers && 
          taskForConflictCheck.assignedMembers.length > 0) {
        
        console.log('[UPDATE CONFLICT CHECK] Capturing tasks for conflict detection...');
        
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
            console.log(`[UPDATE CONFLICT CHECK] Using cached tasks: ${cachedTasks.length} total tasks`);
            
            // Filter for tasks with overlapping members
            for (const task of cachedTasks) {
              if (task.id !== id && // Not the same task
                  task.assignedMembers && 
                  membersToCheck &&
                  task.assignedMembers.some((m: string) => membersToCheck.includes(m))) {
                relevantTasks.push(task);
              }
            }
            
            console.log(`[UPDATE CONFLICT CHECK] Found ${relevantTasks.length} relevant tasks for conflict check`);
          } else {
            console.log('[UPDATE CONFLICT CHECK] No cache available, using HYBRID approach...');
            
            // HYBRID: Direct Notion query for specific period WITH RATE LIMITING
            try {
              console.log('[UPDATE CONFLICT CHECK] Using rate-limited Notion fallback...');
              
              const memberTasks = await notionRateLimiter.scheduleHighPriority(async () => {
                console.log('[UPDATE CONFLICT CHECK] Executing Notion query through rate limiter...');
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
              
              console.log(`[UPDATE CONFLICT CHECK] Found ${relevantTasks.length} relevant tasks from Notion`);
              console.log('[UPDATE CONFLICT CHECK] Rate limiter stats:', notionRateLimiter.getStats());
              
            } catch (error) {
              console.error('[UPDATE CONFLICT CHECK] Error fetching from Notion:', error);
              // Continue without conflicts
            }
          }
          
          // Now check conflicts with the captured tasks
          schedulingConflicts = await tasksConflictService.checkSchedulingConflictsWithTasks(
            taskForConflictCheck as any,
            relevantTasks
          );
          
        } catch (error) {
          console.error('[UPDATE CONFLICT CHECK] Error capturing tasks for conflict detection:', error);
          // Continue without conflicts rather than failing the update
        }
      }

      return res.status(200).json({
        success: true,
        conflicts: schedulingConflicts,
        meta: {
          timestamp: new Date().toISOString(),
          conflictsFound: schedulingConflicts.length
        }
      });
      
    } catch (error) {
      console.error("Error checking update conflicts:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to check update conflicts"
      });
    }
  }
}

export const taskConflictController = new TaskConflictController();