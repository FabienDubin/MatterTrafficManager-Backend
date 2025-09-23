/**
 * Controller for conflict management endpoints
 * Task 3.3 & 3.4: Conflict resolution API
 */

import { Request, Response } from 'express';
import { conflictService } from '../services/conflict.service';
import { ConflictLogModel } from '../models/ConflictLog.model';
import logger from '../config/logger.config';

export class ConflictsController {
  /**
   * Get list of conflicts
   * GET /api/conflicts?status=pending&severity=high&entityType=task
   */
  async getConflicts(req: Request, res: Response) {
    try {
      const { 
        status = 'all', // all, pending, resolved
        severity,
        entityType,
        limit = '100',
        offset = '0'
      } = req.query;

      // Build query
      const query: any = {};
      
      if (status !== 'all') {
        if (status === 'pending') {
          query.resolution = 'pending';
        } else if (status === 'resolved') {
          query.resolution = { $ne: 'pending' };
        }
      }
      
      if (severity) {
        query.severity = severity;
      }
      
      if (entityType) {
        query.entityType = entityType;
      }

      // Get conflicts
      const conflicts = await ConflictLogModel
        .find(query)
        .sort({ severity: -1, detectedAt: -1 })
        .limit(parseInt(limit as string))
        .skip(parseInt(offset as string))
        .lean();

      // Get stats
      const totalCount = await ConflictLogModel.countDocuments(query);
      const pendingCount = await ConflictLogModel.countDocuments({ 
        ...query, 
        resolution: 'pending' 
      });

      return res.status(200).json({
        success: true,
        data: {
          conflicts,
          pagination: {
            total: totalCount,
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            hasMore: totalCount > parseInt(offset as string) + parseInt(limit as string)
          },
          summary: {
            total: totalCount,
            pending: pendingCount,
            resolved: totalCount - pendingCount
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error fetching conflicts:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch conflicts',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get conflict details
   * GET /api/conflicts/:id
   */
  async getConflictById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const conflict = await ConflictLogModel.findById(id).lean();
      
      if (!conflict) {
        return res.status(404).json({
          success: false,
          error: 'Conflict not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: conflict,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error fetching conflict details:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch conflict details',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Resolve a conflict
   * POST /api/conflicts/:id/resolve
   * Body: { strategy: 'notion_wins' | 'local_wins' | 'merged', notes?: string }
   */
  async resolveConflict(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { strategy, notes } = req.body;
      const userId = (req as any).user?.id || 'system';

      // Validate strategy
      if (!['notion_wins', 'local_wins', 'merged'].includes(strategy)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid resolution strategy. Must be: notion_wins, local_wins, or merged'
        });
      }

      // Get conflict
      const conflict = await ConflictLogModel.findById(id);
      
      if (!conflict) {
        return res.status(404).json({
          success: false,
          error: 'Conflict not found'
        });
      }

      if (conflict.resolution !== 'pending') {
        return res.status(400).json({
          success: false,
          error: 'Conflict already resolved',
          resolution: conflict.resolution,
          resolvedAt: conflict.resolvedAt
        });
      }

      // Resolve the conflict
      const resolvedData = await conflictService.resolveConflict(
        conflict,
        strategy
      );

      // Update conflict record
      conflict.resolution = strategy;
      conflict.resolvedAt = new Date();
      conflict.resolvedBy = userId;
      conflict.resolutionNotes = notes;
      conflict.autoResolved = false;
      conflict.mergedData = resolvedData;
      await conflict.save();

      logger.info(`Conflict ${id} resolved with strategy: ${strategy}`, {
        conflictId: id,
        strategy,
        resolvedBy: userId,
        entityType: conflict.entityType,
        entityId: conflict.entityId
      });

      return res.status(200).json({
        success: true,
        message: `Conflict resolved using ${strategy} strategy`,
        data: {
          conflict: conflict.toObject(),
          resolvedData
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error resolving conflict:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to resolve conflict',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get conflict statistics
   * GET /api/conflicts/stats?days=7
   */
  async getConflictStats(req: Request, res: Response) {
    try {
      const days = parseInt(req.query.days as string) || 7;
      
      const stats = await conflictService.getConflictStats(days);
      
      // Get recent critical conflicts
      const criticalConflicts = await ConflictLogModel
        .find({ 
          severity: 'critical',
          resolution: 'pending'
        })
        .select('entityType entityId detectedAt conflictDetails')
        .sort({ detectedAt: -1 })
        .limit(5)
        .lean();

      // Get most common conflict types
      const commonTypes = await ConflictLogModel.aggregate([
        {
          $match: {
            detectedAt: { 
              $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) 
            }
          }
        },
        {
          $group: {
            _id: '$conflictType',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 5
        }
      ]);

      return res.status(200).json({
        success: true,
        data: {
          period: `${days} days`,
          stats,
          criticalConflicts,
          commonTypes,
          recommendations: this.getRecommendations(stats)
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error fetching conflict stats:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch conflict statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get recommendations based on conflict stats
   */
  private getRecommendations(stats: any): string[] {
    const recommendations = [];

    if (stats.pending > 10) {
      recommendations.push('🔴 High number of pending conflicts. Manual review recommended.');
    }

    if (stats.autoResolveRate < 0.8) {
      recommendations.push('⚠️ Low auto-resolve rate. Consider adjusting conflict detection sensitivity.');
    }

    if (stats.total === 0) {
      recommendations.push('✅ No conflicts detected. Synchronization is working well.');
    } else if (stats.autoResolveRate > 0.95) {
      recommendations.push('✅ Excellent auto-resolve rate. Conflict management is efficient.');
    }

    return recommendations;
  }

  /**
   * Batch resolve conflicts
   * POST /api/conflicts/batch-resolve
   * Body: { conflictIds: string[], strategy: 'notion_wins' | 'local_wins' }
   */
  async batchResolveConflicts(req: Request, res: Response) {
    try {
      const { conflictIds, strategy } = req.body;
      const userId = (req as any).user?.id || 'system';

      if (!Array.isArray(conflictIds) || conflictIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'conflictIds must be a non-empty array'
        });
      }

      if (!['notion_wins', 'local_wins'].includes(strategy)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid strategy for batch resolution. Must be: notion_wins or local_wins'
        });
      }

      const results = {
        resolved: [] as string[],
        failed: [] as { id: string; error: string }[],
        alreadyResolved: [] as string[]
      };

      for (const conflictId of conflictIds) {
        try {
          const conflict = await ConflictLogModel.findById(conflictId);
          
          if (!conflict) {
            results.failed.push({ 
              id: conflictId, 
              error: 'Not found' 
            });
            continue;
          }

          if (conflict.resolution !== 'pending') {
            results.alreadyResolved.push(conflictId);
            continue;
          }

          // Resolve the conflict
          const resolvedData = await conflictService.resolveConflict(
            conflict,
            strategy
          );

          // Update conflict record
          conflict.resolution = strategy;
          conflict.resolvedAt = new Date();
          conflict.resolvedBy = userId;
          conflict.resolutionNotes = `Batch resolved with ${strategy}`;
          conflict.autoResolved = false;
          conflict.mergedData = resolvedData;
          await conflict.save();

          results.resolved.push(conflictId);
        } catch (error) {
          results.failed.push({ 
            id: conflictId, 
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      logger.info('Batch conflict resolution completed', {
        strategy,
        resolvedBy: userId,
        resolved: results.resolved.length,
        failed: results.failed.length,
        alreadyResolved: results.alreadyResolved.length
      });

      return res.status(200).json({
        success: true,
        message: `Batch resolution completed: ${results.resolved.length} resolved`,
        data: results,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error in batch resolve:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to batch resolve conflicts',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const conflictsController = new ConflictsController();