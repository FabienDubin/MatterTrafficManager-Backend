import { ConflictLogModel, IConflictLog } from '../models/ConflictLog.model';
import logger from '../config/logger.config';

export class ConflictService {
  /**
   * Detect conflicts between cached and fresh data
   */
  async detectConflict(
    entityType: string,
    entityId: string,
    cachedData: any,
    freshData: any
  ): Promise<IConflictLog | null> {
    try {
      // Check if data has been modified
      if (!cachedData || !freshData) {
        return null;
      }

      // Compare last edited timestamps
      const cachedTime = cachedData.last_edited_time || cachedData.updatedAt;
      const freshTime = freshData.last_edited_time || freshData.updatedAt;

      if (cachedTime && freshTime && cachedTime !== freshTime) {
        logger.warn(`Conflict detected for ${entityType}:${entityId}`, {
          cachedTime,
          freshTime
        });

        // Determine severity based on affected fields
        const affectedFields = this.detectAffectedFields(cachedData, freshData);
        const severity = this.determineSeverity(affectedFields);
        
        // Create conflict log
        const conflict = await ConflictLogModel.create({
          entityType: entityType as any,
          entityId,
          notionId: freshData.id || entityId,
          conflictType: 'update_conflict',
          resolution: severity === 'low' ? 'notion_wins' : 'pending',
          localData: cachedData,
          notionData: freshData,
          detectedAt: new Date(),
          autoResolved: severity === 'low',
          resolvedAt: severity === 'low' ? new Date() : undefined,
          conflictDetails: `Data was modified in Notion (${freshTime}) while cached version was from ${cachedTime}`,
          affectedFields: affectedFields,
          severity: severity,
          userNotified: false
        });

        // Auto-resolve low severity conflicts with notion_wins
        if (severity === 'low') {
          logger.info(`Auto-resolving low severity conflict for ${entityType}:${entityId} with notion_wins strategy`);
          
          // Update cache with Notion data
          const redisService = require('./redis.service').redisService;
          await redisService.set(
            `${entityType}:${entityId}`,
            freshData,
            entityType
          );
        }

        return conflict;
      }

      return null;
    } catch (error) {
      logger.error('Error detecting conflict:', error);
      return null;
    }
  }

  /**
   * Resolve conflicts based on strategy
   */
  async resolveConflict(
    conflict: IConflictLog,
    strategy: 'notion_wins' | 'local_wins' | 'merged' = 'notion_wins'
  ): Promise<any> {
    try {
      let resolvedData: any;

      switch (strategy) {
        case 'notion_wins':
          resolvedData = conflict.notionData;
          break;

        case 'local_wins':
          resolvedData = conflict.localData;
          break;

        case 'merged':
          resolvedData = this.mergeData(conflict.localData, conflict.notionData);
          break;

        default:
          resolvedData = conflict.notionData;
      }

      // Update conflict log
      conflict.resolution = strategy;
      conflict.resolvedAt = new Date();
      conflict.autoResolved = true;
      conflict.mergedData = resolvedData;
      await conflict.save();

      logger.info(`Conflict resolved for ${conflict.entityType}:${conflict.entityId} using ${strategy} strategy`);
      return resolvedData;

    } catch (error) {
      logger.error('Error resolving conflict:', error);
      throw error;
    }
  }

  /**
   * Merge data from local and Notion sources
   */
  private mergeData(localData: any, notionData: any): any {
    // Simple merge strategy: take non-null values, prefer Notion for conflicts
    const merged = { ...localData };

    for (const key in notionData) {
      if (notionData[key] !== null && notionData[key] !== undefined) {
        // For nested objects, merge recursively
        if (typeof notionData[key] === 'object' && !Array.isArray(notionData[key])) {
          merged[key] = this.mergeData(merged[key] || {}, notionData[key]);
        } else {
          merged[key] = notionData[key];
        }
      }
    }

    return merged;
  }

  /**
   * Detect which fields are affected by the conflict
   */
  private detectAffectedFields(cachedData: any, freshData: any): string[] {
    const affectedFields: string[] = [];

    // Compare top-level properties
    const allKeys = new Set([
      ...Object.keys(cachedData?.properties || {}),
      ...Object.keys(freshData?.properties || {})
    ]);

    for (const key of allKeys) {
      const cachedValue = JSON.stringify(cachedData?.properties?.[key]);
      const freshValue = JSON.stringify(freshData?.properties?.[key]);

      if (cachedValue !== freshValue) {
        affectedFields.push(key);
      }
    }

    return affectedFields;
  }

  /**
   * Determine severity based on affected fields
   */
  private determineSeverity(affectedFields: string[]): 'low' | 'medium' | 'high' | 'critical' {
    // Critical fields that should never auto-resolve
    const criticalFields = ['status', 'assignedMembers', 'projectId'];
    
    // Important fields that need review
    const importantFields = ['workPeriod', 'billedHours', 'actualHours'];
    
    // Check if any critical fields are affected
    if (affectedFields.some(field => criticalFields.includes(field))) {
      return 'high';
    }
    
    // Check if multiple important fields are affected
    const importantCount = affectedFields.filter(field => importantFields.includes(field)).length;
    if (importantCount > 1) {
      return 'medium';
    }
    
    // Single important field
    if (importantCount === 1) {
      return 'medium';
    }
    
    // Only minor fields affected (title, notes, etc.)
    return 'low';
  }

  /**
   * Get pending conflicts for review
   */
  async getPendingConflicts(): Promise<IConflictLog[]> {
    return ConflictLogModel.find({ resolution: 'pending' })
      .sort({ detectedAt: -1 })
      .limit(100);
  }

  /**
   * Get conflict statistics
   */
  async getConflictStats(days: number = 7): Promise<any> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const stats = await ConflictLogModel.aggregate([
      { $match: { detectedAt: { $gte: since } } },
      {
        $group: {
          _id: {
            entityType: '$entityType',
            conflictType: '$conflictType',
            resolution: '$resolution'
          },
          count: { $sum: 1 },
          avgResolutionTime: {
            $avg: {
              $subtract: ['$resolvedAt', '$detectedAt']
            }
          }
        }
      }
    ]);

    const total = await ConflictLogModel.countDocuments({ detectedAt: { $gte: since } });
    const pending = await ConflictLogModel.countDocuments({ 
      detectedAt: { $gte: since },
      resolution: 'pending' 
    });
    const autoResolved = await ConflictLogModel.countDocuments({ 
      detectedAt: { $gte: since },
      autoResolved: true 
    });

    return {
      total,
      pending,
      autoResolved,
      autoResolveRate: total > 0 ? (autoResolved / total) : 0,
      byType: stats
    };
  }
}

// Export singleton instance
export const conflictService = new ConflictService();