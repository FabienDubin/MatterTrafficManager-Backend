/**
 * Service for tracking user activity and request metrics
 * Used for dashboard metrics
 */

import logger from '../config/logger.config';

interface ActiveUser {
  userId: string;
  email: string;
  lastActivity: Date;
}

interface RequestMetric {
  timestamp: Date;
  path: string;
}

interface ErrorMetric {
  id: string;
  message: string;
  type: string;
  timestamp: Date;
  path: string;
  statusCode: number;
  userId?: string;
}

class ActivityTrackerService {
  private activeUsers: Map<string, ActiveUser> = new Map();
  private requestMetrics: RequestMetric[] = [];
  private errorMetrics: ErrorMetric[] = [];
  private readonly ACTIVE_USER_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_ERRORS = 100;
  private readonly ERROR_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Track user activity from authenticated requests
   */
  trackUserActivity(userId: string, email: string): void {
    this.activeUsers.set(userId, {
      userId,
      email,
      lastActivity: new Date()
    });
    
    // Clean up inactive users
    this.cleanupInactiveUsers();
  }

  /**
   * Track request for rate calculation
   */
  trackRequest(path?: string): void {
    this.requestMetrics.push({
      timestamp: new Date(),
      path: path || 'unknown'
    });
    
    // Keep only last minute of requests
    const oneMinuteAgo = new Date(Date.now() - 60000);
    this.requestMetrics = this.requestMetrics.filter(
      metric => metric.timestamp > oneMinuteAgo
    );
  }

  /**
   * Track error for monitoring
   */
  trackError(error: {
    message: string;
    statusCode: number;
    path: string;
    userId?: string;
    type?: string;
  }): void {
    const errorMetric: ErrorMetric = {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: error.message || 'Unknown error',
      type: error.type || this.getErrorType(error.statusCode),
      timestamp: new Date(),
      path: error.path,
      statusCode: error.statusCode,
      ...(error.userId && { userId: error.userId })
    };

    this.errorMetrics.unshift(errorMetric);
    
    // Keep only MAX_ERRORS most recent
    if (this.errorMetrics.length > this.MAX_ERRORS) {
      this.errorMetrics = this.errorMetrics.slice(0, this.MAX_ERRORS);
    }
    
    // Clean up old errors
    this.cleanupOldErrors();
    
    logger.error('Tracked error:', errorMetric);
  }

  /**
   * Get active users
   */
  getActiveUsers(): { count: number; users: string[] } {
    this.cleanupInactiveUsers();
    
    const users = Array.from(this.activeUsers.values()).map(u => u.email);
    
    return {
      count: users.length,
      users
    };
  }

  /**
   * Get request rate metrics
   */
  getRequestRate(): { requestsPerMinute: number; requestsPerSecond: number } {
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const recentRequests = this.requestMetrics.filter(
      metric => metric.timestamp > oneMinuteAgo
    );
    
    const requestsPerMinute = recentRequests.length;
    const requestsPerSecond = Math.round((requestsPerMinute / 60) * 10) / 10;
    
    return {
      requestsPerMinute,
      requestsPerSecond
    };
  }

  /**
   * Get recent errors
   */
  getRecentErrors(): { recent: ErrorMetric[]; total24h: number } {
    this.cleanupOldErrors();
    
    const oneDayAgo = new Date(Date.now() - this.ERROR_TTL);
    const errors24h = this.errorMetrics.filter(
      error => error.timestamp > oneDayAgo
    );
    
    // Group errors by message and count
    const errorGroups = new Map<string, ErrorMetric & { count: number }>();
    
    errors24h.slice(0, 10).forEach(error => {
      const key = `${error.message}_${error.type}`;
      const existing = errorGroups.get(key);
      
      if (existing) {
        existing.count++;
      } else {
        errorGroups.set(key, { ...error, count: 1 });
      }
    });
    
    return {
      recent: Array.from(errorGroups.values()),
      total24h: errors24h.length
    };
  }

  /**
   * Clean up inactive users
   */
  private cleanupInactiveUsers(): void {
    const cutoffTime = new Date(Date.now() - this.ACTIVE_USER_TTL);
    
    for (const [userId, user] of this.activeUsers.entries()) {
      if (user.lastActivity < cutoffTime) {
        this.activeUsers.delete(userId);
      }
    }
  }

  /**
   * Clean up old errors
   */
  private cleanupOldErrors(): void {
    const cutoffTime = new Date(Date.now() - this.ERROR_TTL);
    
    this.errorMetrics = this.errorMetrics.filter(
      error => error.timestamp > cutoffTime
    );
  }

  /**
   * Get error type from status code
   */
  private getErrorType(statusCode: number): string {
    if (statusCode >= 500) return 'Server Error';
    if (statusCode === 404) return 'Not Found';
    if (statusCode === 403) return 'Forbidden';
    if (statusCode === 401) return 'Unauthorized';
    if (statusCode === 400) return 'Bad Request';
    return 'Error';
  }

  /**
   * Clear all metrics (for testing)
   */
  clearAll(): void {
    this.activeUsers.clear();
    this.requestMetrics = [];
    this.errorMetrics = [];
  }
}

// Export singleton instance
export const activityTracker = new ActivityTrackerService();