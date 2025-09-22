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
        promises.push(
          notionService.getTasksForCalendarView(strategy.dateRange.start, strategy.dateRange.end)
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
   */
  async preloadOnStartup(): Promise<void> {
    logger.info('Starting application cache warmup...');
    const startTime = performance.now();

    try {
      // High priority preloads
      await Promise.all([
        // Current month tasks
        notionService.getTasksForCalendarView(startOfMonth(new Date()), endOfMonth(new Date())),
        // All users and teams (frequently accessed)
        notionService.getAllMembers(),
        notionService.getAllTeams(),
      ]);

      // Medium priority preloads (don't wait)
      Promise.all([notionService.getAllProjects(), notionService.getAllClients()]).catch(err =>
        logger.error('Background preload error:', err)
      );

      const duration = performance.now() - startTime;
      logger.info(`Startup preload completed in ${duration.toFixed(2)}ms`);
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

      await Promise.all([
        notionService.getTasksForCalendarView(weekStart, weekEnd),
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
