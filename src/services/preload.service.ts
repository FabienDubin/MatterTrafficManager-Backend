/**
 * Service for intelligent cache preloading based on routes and patterns
 */

import { addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import logger from '../config/logger.config';
import notionService from './notion.service';
import { cacheMetricsService } from './cache-metrics.service';

interface PreloadStrategy {
  route: string;
  entities: string[];
  dateRange?: { start: Date; end: Date };
  priority: 'high' | 'medium' | 'low';
}

class PreloadService {
  private preloadStrategies: PreloadStrategy[] = [
    {
      route: '/calendar',
      entities: ['tasks', 'members', 'projects', 'teams'],
      dateRange: {
        start: addDays(new Date(), -30),
        end: addDays(new Date(), 60),
      },
      priority: 'high',
    },
    {
      route: '/tasks',
      entities: ['tasks', 'members', 'projects'],
      dateRange: {
        start: startOfMonth(new Date()),
        end: endOfMonth(new Date()),
      },
      priority: 'high',
    },
    {
      route: '/team',
      entities: ['members', 'teams'],
      priority: 'medium',
    },
    {
      route: '/projects',
      entities: ['projects', 'clients', 'tasks'],
      priority: 'medium',
    },
    {
      route: '/admin',
      entities: ['members', 'teams', 'projects', 'clients'],
      priority: 'low',
    },
  ];

  /**
   * Preload data based on the current route
   */
  async preloadForRoute(route: string): Promise<void> {
    const startTime = performance.now();
    const strategy = this.findStrategy(route);

    if (!strategy) {
      logger.debug(`No preload strategy for route: ${route}`);
      return;
    }

    logger.info(`Preloading data for route: ${route} (priority: ${strategy.priority})`);

    try {
      const promises: Promise<any>[] = [];

      // Preload based on entity types
      if (strategy.entities.includes('tasks') && strategy.dateRange) {
        // Use consistent string dates for cache keys
        const startStr = strategy.dateRange.start.toISOString().split('T')[0];
        const endStr = strategy.dateRange.end.toISOString().split('T')[0];
        
        promises.push(
          notionService.getTasksForCalendarView(strategy.dateRange.start, strategy.dateRange.end, {
            originalStartDate: startStr,
            originalEndDate: endStr
          })
        );
      }

      if (strategy.entities.includes('members')) {
        promises.push(notionService.getAllMembers());
      }

      if (strategy.entities.includes('teams')) {
        promises.push(notionService.getAllTeams());
      }

      if (strategy.entities.includes('projects')) {
        promises.push(notionService.getAllProjects());
      }

      if (strategy.entities.includes('clients')) {
        promises.push(notionService.getAllClients());
      }

      await Promise.all(promises);

      const duration = performance.now() - startTime;
      logger.info(`Preload completed for ${route} in ${duration.toFixed(2)}ms`);

      // Record metrics
      cacheMetricsService.recordHit('preload', duration);
    } catch (error) {
      logger.error('Preload error:', error);
      const duration = performance.now() - startTime;
      cacheMetricsService.recordMiss('preload', duration);
    }
  }

  /**
   * Preload data on application startup
   * Matches frontend Phase 0 loading strategy (3 phases) to ensure cache hits
   */
  async preloadOnStartup(): Promise<void> {
    logger.info('Starting application cache warmup...');
    const startTime = performance.now();

    try {
      const now = new Date();

      // Phase 1: Core period (±7 days) - matches frontend Phase 1
      const phase1Start = addDays(now, -7);
      const phase1End = addDays(now, 7);
      const phase1StartStr = phase1Start.toISOString().split('T')[0];
      const phase1EndStr = phase1End.toISOString().split('T')[0];

      // Phase 2a: Past data (-30 to -7 days) - matches frontend Phase 2a
      const phase2aStart = addDays(now, -30);
      const phase2aEnd = addDays(now, -7);
      const phase2aStartStr = phase2aStart.toISOString().split('T')[0];
      const phase2aEndStr = phase2aEnd.toISOString().split('T')[0];

      // Phase 2b: Future data (+7 to +60 days) - matches frontend Phase 2b
      const phase2bStart = addDays(now, 7);
      const phase2bEnd = addDays(now, 60);
      const phase2bStartStr = phase2bStart.toISOString().split('T')[0];
      const phase2bEndStr = phase2bEnd.toISOString().split('T')[0];

      // High priority preloads - Load all 3 phases in parallel with consistent cache keys
      await Promise.all([
        // Calendar periods - using string dates for consistent cache keys
        notionService.getTasksForCalendarView(phase1Start, phase1End, { 
          originalStartDate: phase1StartStr, 
          originalEndDate: phase1EndStr 
        }),
        notionService.getTasksForCalendarView(phase2aStart, phase2aEnd, { 
          originalStartDate: phase2aStartStr, 
          originalEndDate: phase2aEndStr 
        }),
        notionService.getTasksForCalendarView(phase2bStart, phase2bEnd, { 
          originalStartDate: phase2bStartStr, 
          originalEndDate: phase2bEndStr 
        }),
        // All users and teams (frequently accessed)
        notionService.getAllMembers(),
        notionService.getAllTeams(),
      ]);

      // Medium priority preloads (don't wait)
      Promise.all([notionService.getAllProjects(), notionService.getAllClients()]).catch(err =>
        logger.error('Background preload error:', err)
      );

      const duration = performance.now() - startTime;
      logger.info(`✅ Startup preload completed in ${duration.toFixed(2)}ms (cached ±7d, -30d to -7d, +7d to +60d)`);
    } catch (error) {
      logger.error('Startup preload error:', error);
    }
  }

  /**
   * Refresh data that's about to expire
   */
  async refreshExpiringData(): Promise<void> {
    logger.debug('Checking for expiring cache entries...');

    // This would need access to Redis TTL info
    // For now, we'll refresh common data periodically
    try {
      // Refresh current week's tasks
      const weekStart = startOfWeek(new Date());
      const weekEnd = endOfWeek(new Date());
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const weekEndStr = weekEnd.toISOString().split('T')[0];

      await Promise.all([
        notionService.getTasksForCalendarView(weekStart, weekEnd, {
          originalStartDate: weekStartStr,
          originalEndDate: weekEndStr
        }),
        notionService.getAllMembers(), // Members change less frequently
      ]);

      logger.debug('Refreshed expiring cache entries');
    } catch (error) {
      logger.error('Error refreshing expiring data:', error);
    }
  }

  /**
   * Find preload strategy for a route
   */
  private findStrategy(route: string): PreloadStrategy | undefined {
    // Match exact route or route prefix
    return this.preloadStrategies.find(
      strategy => route === strategy.route || route.startsWith(strategy.route)
    );
  }

  /**
   * Clear all preload strategies (for testing)
   */
  clearStrategies(): void {
    this.preloadStrategies = [];
  }

  /**
   * Add custom preload strategy
   */
  addStrategy(strategy: PreloadStrategy): void {
    this.preloadStrategies.push(strategy);
  }
}

export const preloadService = new PreloadService();
