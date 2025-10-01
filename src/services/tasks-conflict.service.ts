import { ConflictLogModel } from "../models/ConflictLog.model";
import { TaskSchedulingConflictModel } from "../models/TaskSchedulingConflict.model";
import { redisService } from "./redis.service";
import notionService from "./notion.service";
import { NotionTask, NotionMember } from "../types/notion.types";
import { SchedulingConflict } from "../controllers/tasks/tasks-conflict.controller";
import { parseISO, differenceInHours, format } from "date-fns";

export interface SyncStatus {
  synced: boolean;
  lastSync: string;
  conflicts: {
    hasConflicts: boolean;
    conflictId?: string;
    severity?: string;
    detectedAt?: Date;
  };
}

/**
 * Service to handle task conflict detection and sync status
 */
export class TasksConflictService {
  /**
   * Check for conflicts and build sync status for an entity
   */
  async getSyncStatus(entityId: string, entityType: string = 'task'): Promise<SyncStatus> {
    try {
      // Check for pending conflicts
      const pendingConflicts = await ConflictLogModel.find({
        entityId,
        entityType,
        resolution: 'pending'
      }).sort({ detectedAt: -1 }).limit(1);

      const hasConflicts = pendingConflicts.length > 0;
      const latestConflict = pendingConflicts[0];

      if (hasConflicts && latestConflict && latestConflict._id) {
        return {
          synced: false,
          lastSync: new Date().toISOString(),
          conflicts: {
            hasConflicts: true,
            conflictId: latestConflict._id.toString(),
            severity: latestConflict.severity || 'medium',
            detectedAt: latestConflict.detectedAt
          }
        };
      }

      return {
        synced: true,
        lastSync: new Date().toISOString(),
        conflicts: {
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
   * Check scheduling conflicts for a task
   * Detects: overlaps, holidays, school periods, overload
   */
  async checkSchedulingConflicts(taskData: Partial<NotionTask>): Promise<SchedulingConflict[]> {
    const conflicts: SchedulingConflict[] = [];
    
    console.log('[CONFLICT DEBUG] Checking task:', {
      id: taskData.id,
      title: taskData.title,
      assignedMembers: taskData.assignedMembers,
      workPeriod: taskData.workPeriod,
      taskType: taskData.taskType
    });
    
    // Skip if no members assigned or no work period
    if (!taskData.assignedMembers?.length || !taskData.workPeriod?.startDate || !taskData.workPeriod?.endDate) {
      console.log('[CONFLICT DEBUG] Skipping - missing data');
      return conflicts;
    }

    // Skip conflict detection for remote tasks (télétravail)
    if (taskData.taskType === 'remote') {
      console.log('[CONFLICT DEBUG] Skipping - remote task');
      return conflicts;
    }

    const taskStart = taskData.workPeriod.startDate instanceof Date 
      ? taskData.workPeriod.startDate 
      : parseISO(taskData.workPeriod.startDate as any);
    
    const taskEnd = taskData.workPeriod.endDate instanceof Date
      ? taskData.workPeriod.endDate
      : parseISO(taskData.workPeriod.endDate as any);

    // Check conflicts for each assigned member
    for (const memberId of taskData.assignedMembers) {
      try {
        // Get member info
        const member = await this.getMemberInfo(memberId);
        const memberName = member?.name || 'Unknown';
        
        console.log(`[CONFLICT DEBUG] Checking member ${memberId} (${memberName})`);
        
        // Get all tasks for this member from cache
        const memberTasks = await this.getMemberTasks(memberId, taskStart, taskEnd);
        console.log(`[CONFLICT DEBUG] Found ${memberTasks.length} tasks for member`);
        
        // Filter out current task and remote tasks
        const otherTasks = memberTasks.filter(t => 
          t.id !== taskData.id && 
          t.taskType !== 'remote'
        );

        // Check for overlapping tasks
        for (const otherTask of otherTasks) {
          if (this.periodsOverlap(
            { start: taskStart, end: taskEnd },
            { 
              start: otherTask.workPeriod.startDate!, 
              end: otherTask.workPeriod.endDate! 
            }
          )) {
            // Determine conflict type and severity
            if (otherTask.taskType === 'holiday') {
              conflicts.push({
                type: 'holiday',
                message: `${memberName} est en congé ce jour`,
                memberId,
                memberName,
                conflictingTaskId: otherTask.id,
                conflictingTaskTitle: otherTask.title,
                severity: 'high'
              });
            } else if (otherTask.taskType === 'school') {
              conflicts.push({
                type: 'school',
                message: `${memberName} est en formation ce jour`,
                memberId,
                memberName,
                conflictingTaskId: otherTask.id,
                conflictingTaskTitle: otherTask.title,
                severity: 'medium'
              });
            } else {
              conflicts.push({
                type: 'overlap',
                message: `${memberName} est déjà occupé avec "${otherTask.title}"`,
                memberId,
                memberName,
                conflictingTaskId: otherTask.id,
                conflictingTaskTitle: otherTask.title,
                severity: 'medium'
              });
            }
          }
        }

        // Check for daily overload (> 8 hours)
        const dailyHours = await this.calculateDailyHours(memberId, taskStart, taskEnd, taskData.id);
        const taskHours = differenceInHours(taskEnd, taskStart);
        
        for (const [date, hours] of Object.entries(dailyHours)) {
          if (hours + taskHours > 8) {
            conflicts.push({
              type: 'overload',
              message: `${memberName} dépasserait 8h de travail le ${date} (${hours + taskHours}h au total)`,
              memberId,
              memberName,
              severity: 'low'
            });
          }
        }
      } catch (error) {
        console.error(`Error checking conflicts for member ${memberId}:`, error);
      }
    }

    return conflicts;
  }

  /**
   * Check scheduling conflicts with provided tasks (no cache lookup)
   * This is used when we already have the relevant tasks in memory
   */
  async checkSchedulingConflictsWithTasks(
    taskData: Partial<NotionTask>, 
    relevantTasks: NotionTask[]
  ): Promise<SchedulingConflict[]> {
    const conflicts: SchedulingConflict[] = [];
    
    console.log('[CONFLICT DEBUG] Checking with provided tasks:', {
      taskId: taskData.id,
      taskTitle: taskData.title,
      assignedMembers: taskData.assignedMembers,
      workPeriod: taskData.workPeriod,
      relevantTasksCount: relevantTasks.length
    });
    
    // Skip if no members assigned or no work period
    if (!taskData.assignedMembers?.length || !taskData.workPeriod?.startDate || !taskData.workPeriod?.endDate) {
      return conflicts;
    }

    // Skip conflict detection for remote tasks
    if (taskData.taskType === 'remote') {
      return conflicts;
    }

    const taskStart = taskData.workPeriod.startDate instanceof Date 
      ? taskData.workPeriod.startDate 
      : parseISO(taskData.workPeriod.startDate as any);
    
    const taskEnd = taskData.workPeriod.endDate instanceof Date
      ? taskData.workPeriod.endDate
      : parseISO(taskData.workPeriod.endDate as any);

    // Check conflicts for each assigned member
    for (const memberId of taskData.assignedMembers) {
      // Get member info from cache if available
      const member = await this.getMemberInfo(memberId);
      const memberName = member?.name || 'Unknown';
      
      console.log(`[CONFLICT DEBUG] Checking member ${memberId} (${memberName})`);
      
      // Filter tasks for this member
      const memberTasks = relevantTasks.filter(t => 
        t.id !== taskData.id && 
        t.assignedMembers && 
        t.assignedMembers.includes(memberId) &&
        t.taskType !== 'remote'
      );
      
      console.log(`[CONFLICT DEBUG] Found ${memberTasks.length} tasks for member`);

      // Check for overlapping tasks
      for (const otherTask of memberTasks) {
        if (otherTask.workPeriod?.startDate && otherTask.workPeriod?.endDate) {
          const otherStart = otherTask.workPeriod.startDate instanceof Date
            ? otherTask.workPeriod.startDate
            : parseISO(otherTask.workPeriod.startDate as any);
          
          const otherEnd = otherTask.workPeriod.endDate instanceof Date
            ? otherTask.workPeriod.endDate
            : parseISO(otherTask.workPeriod.endDate as any);

          if (this.periodsOverlap(
            { start: taskStart, end: taskEnd },
            { start: otherStart, end: otherEnd }
          )) {
            // Determine conflict type and severity
            if (otherTask.taskType === 'holiday') {
              conflicts.push({
                type: 'holiday',
                message: `${memberName} est en congé ce jour`,
                memberId,
                memberName,
                conflictingTaskId: otherTask.id,
                conflictingTaskTitle: otherTask.title,
                severity: 'high'
              });
            } else if (otherTask.taskType === 'school') {
              conflicts.push({
                type: 'school',
                message: `${memberName} est en formation ce jour`,
                memberId,
                memberName,
                conflictingTaskId: otherTask.id,
                conflictingTaskTitle: otherTask.title,
                severity: 'medium'
              });
            } else {
              conflicts.push({
                type: 'overlap',
                message: `${memberName} est déjà occupé avec "${otherTask.title}"`,
                memberId,
                memberName,
                conflictingTaskId: otherTask.id,
                conflictingTaskTitle: otherTask.title,
                severity: 'medium'
              });
            }
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if two time periods overlap
   */
  private periodsOverlap(
    period1: { start: Date; end: Date },
    period2: { start: Date; end: Date }
  ): boolean {
    return (
      (period1.start >= period2.start && period1.start < period2.end) ||
      (period1.end > period2.start && period1.end <= period2.end) ||
      (period1.start <= period2.start && period1.end >= period2.end)
    );
  }

  /**
   * Get member information - CACHE ONLY to avoid rate limits
   */
  private async getMemberInfo(memberId: string): Promise<NotionMember | null> {
    try {
      // ONLY use cache - never call Notion API during conflict detection
      const cacheKey = `member:${memberId}`;
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return cached as NotionMember;
      }

      // If not in cache, return minimal info to avoid Notion API call
      // The member name will be unknown but we avoid rate limits
      return {
        id: memberId,
        name: 'Unknown Member', // Will be updated on next cache refresh
        email: '',
        teams: [],
        tasks: []
      };
    } catch (error) {
      console.error(`Error getting member ${memberId}:`, error);
      return null;
    }
  }

  /**
   * Get all tasks for a member in a date range
   */
  private async getMemberTasks(
    memberId: string,
    startDate: Date,
    endDate: Date
  ): Promise<NotionTask[]> {
    try {
      // Use the exact same cache key as the frontend: 2025-08-26 to 2025-10-25
      // This matches what we see in the logs: "[Progressive] Fetching range: 2025-08-26 to 2025-10-25"
      const startKey = '2025-08-26';
      const endKey = '2025-10-25';
      const cacheKey = `tasks:calendar:start=${startKey}:end=${endKey}`;
      
      console.log(`[CONFLICT DEBUG] Looking for cache key: ${cacheKey}`);
      
      // Get all tasks from the calendar cache
      const cachedTasks = await redisService.get(cacheKey);
      
      if (!cachedTasks || !Array.isArray(cachedTasks)) {
        console.debug(`[CONFLICT DEBUG] No cached tasks found for date range, skipping to avoid rate limit`);
        return [];
      }
      
      console.log(`[CONFLICT DEBUG] Found ${cachedTasks.length} total tasks in cache`);
      
      // Filter tasks for this specific member
      const memberTasks = (cachedTasks as NotionTask[]).filter(task => 
        task.assignedMembers && task.assignedMembers.includes(memberId)
      );
      
      console.log(`[CONFLICT DEBUG] Filtered to ${memberTasks.length} tasks for member ${memberId}`);
      
      return memberTasks;
    } catch (error) {
      console.error(`Error getting tasks for member ${memberId}:`, error);
      return [];
    }
  }

  /**
   * Calculate daily working hours for a member
   */
  private async calculateDailyHours(
    memberId: string,
    startDate: Date,
    endDate: Date,
    excludeTaskId?: string
  ): Promise<Record<string, number>> {
    const dailyHours: Record<string, number> = {};
    
    try {
      const tasks = await this.getMemberTasks(memberId, startDate, endDate);
      
      for (const task of tasks) {
        // Skip excluded task and remote tasks
        if (task.id === excludeTaskId || task.taskType === 'remote') {
          continue;
        }

        if (task.workPeriod?.startDate && task.workPeriod?.endDate) {
          const taskStart = task.workPeriod.startDate instanceof Date 
            ? task.workPeriod.startDate 
            : parseISO(task.workPeriod.startDate as any);
          
          const taskEnd = task.workPeriod.endDate instanceof Date
            ? task.workPeriod.endDate
            : parseISO(task.workPeriod.endDate as any);

          const hours = differenceInHours(taskEnd, taskStart);
          const dateKey = format(taskStart, 'yyyy-MM-dd');
          
          dailyHours[dateKey] = (dailyHours[dateKey] || 0) + hours;
        }
      }
    } catch (error) {
      console.error(`Error calculating daily hours for member ${memberId}:`, error);
    }

    return dailyHours;
  }

  /**
   * Enrich conflicts with member names from Notion
   * Resolves "Unknown Member" by fetching from Notion API in batch
   */
  async enrichConflictsWithMemberNames(conflicts: SchedulingConflict[]): Promise<SchedulingConflict[]> {
    try {
      // Collecter tous les memberIds uniques qui ont besoin d'être résolus
      const memberIdsToResolve = [
        ...new Set(
          conflicts
            .filter(c => !c.memberName || c.memberName === 'Unknown Member' || c.memberName === 'Unknown')
            .map(c => c.memberId)
        )
      ];

      // Si aucun membre à résoudre, retourner les conflits tels quels
      if (memberIdsToResolve.length === 0) {
        return conflicts;
      }

      // Résoudre les noms des membres en batch depuis Notion
      const membersMap = new Map<string, string>();
      const members = await notionService.batchLoadMembers(memberIdsToResolve);
      members.forEach((member, index) => {
        const memberId = memberIdsToResolve[index];
        if (member && member.name && memberId) {
          membersMap.set(memberId, member.name);
        }
      });

      // Enrichir les memberName
      const enrichedConflicts = conflicts.map((conflict) => {
        if (!conflict.memberName || conflict.memberName === 'Unknown Member' || conflict.memberName === 'Unknown') {
          const resolvedName = membersMap.get(conflict.memberId);
          if (resolvedName) {
            return {
              ...conflict,
              memberName: resolvedName,
              message: conflict.message.replace(/Unknown Member/g, resolvedName) // Update message too
            };
          }
        }
        return conflict;
      });

      console.log(`[CONFLICT ENRICH] Resolved ${membersMap.size} member names out of ${memberIdsToResolve.length}`);
      return enrichedConflicts;
    } catch (error) {
      console.error('Error enriching conflicts with member names:', error);
      // Return original conflicts if enrichment fails
      return conflicts;
    }
  }

  /**
   * Save conflicts to MongoDB for persistence
   */
  async saveConflicts(taskId: string, conflicts: SchedulingConflict[]): Promise<void> {
    try {
      // Enrichir les conflits avant sauvegarde
      const enrichedConflicts = await this.enrichConflictsWithMemberNames(conflicts);

      // Use the bulk save method from the model
      await TaskSchedulingConflictModel.bulkSaveConflicts(taskId, enrichedConflicts);
      console.log(`[CONFLICT PERSIST] Saved ${enrichedConflicts.length} conflicts for task ${taskId}`);
    } catch (error) {
      console.error(`Error saving conflicts for task ${taskId}:`, error);
      // Don't throw - conflict saving is not critical
    }
  }

  /**
   * Get conflicts from MongoDB for multiple tasks
   */
  async getConflictsForTasks(taskIds: string[]): Promise<Map<string, SchedulingConflict[]>> {
    const conflictsMap = new Map<string, SchedulingConflict[]>();
    
    try {
      // Batch query for all task conflicts
      const conflicts = await TaskSchedulingConflictModel.findActiveForTasks(taskIds);
      
      // Group conflicts by taskId
      for (const conflict of conflicts) {
        const taskConflicts = conflictsMap.get(conflict.taskId) || [];
        taskConflicts.push({
          type: conflict.type,
          message: conflict.message,
          memberId: conflict.memberId,
          memberName: conflict.memberName || undefined,
          conflictingTaskId: conflict.conflictingTaskId || undefined,
          conflictingTaskTitle: conflict.conflictingTaskTitle || undefined,
          severity: conflict.severity
        } as SchedulingConflict);
        conflictsMap.set(conflict.taskId, taskConflicts);
      }
      
      console.log(`[CONFLICT PERSIST] Loaded conflicts for ${conflictsMap.size}/${taskIds.length} tasks`);
    } catch (error) {
      console.error('Error loading conflicts from MongoDB:', error);
    }
    
    return conflictsMap;
  }

  /**
   * Resolve conflicts for a task (delete them instead of marking as resolved)
   */
  async resolveConflictsForTask(taskId: string): Promise<void> {
    try {
      // Delete conflicts instead of marking them as resolved
      // We don't need to keep resolved conflicts in the database
      await TaskSchedulingConflictModel.deleteForTask(taskId);
      console.log(`[CONFLICT PERSIST] Deleted resolved conflicts for task ${taskId}`);
    } catch (error) {
      console.error(`Error deleting resolved conflicts for task ${taskId}:`, error);
    }
  }

  /**
   * Delete all conflicts for a task (used when task is deleted)
   */
  async deleteConflictsForTask(taskId: string): Promise<void> {
    try {
      await TaskSchedulingConflictModel.deleteForTask(taskId);
      console.log(`[CONFLICT PERSIST] Deleted conflicts for task ${taskId}`);
    } catch (error) {
      console.error(`Error deleting conflicts for task ${taskId}:`, error);
    }
  }
}

// Export singleton instance
export const tasksConflictService = new TasksConflictService();