import { redisService } from "./redis.service";
import notionService from "./notion.service";
import { tasksConflictService } from "./tasks-conflict.service";
import { notionRateLimiter } from "../middleware/rate-limit.middleware";

/**
 * Service for detecting task conflicts
 */
export class ConflictDetectionService {
  /**
   * Detect conflicts for a new task (CREATE operation)
   */
  async detectCreateConflicts(taskData: any): Promise<any[]> {
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
    
    return schedulingConflicts;
  }

  /**
   * Detect conflicts for task update (ASYNC mode)
   */
  async detectUpdateConflictsAsync(id: string, updateData: any, currentTask?: any): Promise<{ conflicts: any[], method: string }> {
    let schedulingConflicts: any[] = [];
    let conflictDetectionMethod = 'none';
    
    // Only check conflicts if we're updating dates or members
    if (updateData.workPeriod || updateData.assignedMembers) {
      // Build what the updated task will look like
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
    
    return { conflicts: schedulingConflicts, method: conflictDetectionMethod };
  }

  /**
   * Detect conflicts for task update (SYNC mode)
   */
  async detectUpdateConflictsSync(id: string, updateData: any, currentTask?: any): Promise<any[]> {
    let schedulingConflicts: any[] = [];
    
    // Only check conflicts if we're updating dates or members
    if (updateData.workPeriod || updateData.assignedMembers) {
      // Build what the updated task will look like
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
    
    return schedulingConflicts;
  }
}

export const conflictDetectionService = new ConflictDetectionService();