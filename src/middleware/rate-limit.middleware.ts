import rateLimit from 'express-rate-limit';
import Bottleneck from 'bottleneck';

/**
 * Rate limiter for authentication endpoints
 * Protection against brute force attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

/**
 * Notion API Rate Limiter using Bottleneck
 * 
 * Notion API limits:
 * - 3 requests per second on average
 * - Burst capacity for short periods
 * 
 * This limiter ensures we never exceed these limits
 */
class NotionRateLimiter {
  private limiter: Bottleneck;
  private stats = {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    dropped: 0
  };

  constructor() {
    this.limiter = new Bottleneck({
      // Rate limiting configuration
      maxConcurrent: 2,              // Max 2 parallel requests to Notion
      minTime: 334,                  // Min 334ms between requests (≈3 req/sec)
      
      // Reservoir for burst capacity
      reservoir: 3,                  // Allow burst of 3 requests
      reservoirRefreshInterval: 1000, // Refill reservoir every second
      reservoirRefreshAmount: 3,      // Refill to 3 requests
      
      // Queue configuration
      highWater: 20,                 // Warn if queue exceeds 20 requests
      strategy: Bottleneck.strategy.OVERFLOW_PRIORITY, // Drop low priority if queue full
      
      // Retry configuration
      rejectOnDrop: false            // Don't throw error on drop, return null
    });

    this.setupEventListeners();
  }

  /**
   * Schedule a Notion API call with rate limiting
   * @param fn Function that makes the Notion API call
   * @param priority Higher number = higher priority (default 5)
   */
  async schedule<T>(fn: () => Promise<T>, priority: number = 5): Promise<T> {
    try {
      this.stats.queued++;
      
      const result = await this.limiter.schedule({ priority }, async () => {
        this.stats.running++;
        this.stats.queued--;
        
        try {
          const response = await fn();
          this.stats.completed++;
          return response;
        } catch (error) {
          this.stats.failed++;
          throw error;
        } finally {
          this.stats.running--;
        }
      });

      return result;
    } catch (error) {
      if (error instanceof Bottleneck.BottleneckError) {
        console.warn('[RATE_LIMIT] Request was dropped due to queue overflow');
        this.stats.dropped++;
      }
      throw error;
    }
  }

  /**
   * Schedule with high priority (for user-initiated actions)
   */
  async scheduleHighPriority<T>(fn: () => Promise<T>): Promise<T> {
    return this.schedule(fn, 9);
  }

  /**
   * Schedule with low priority (for background tasks)
   */
  async scheduleLowPriority<T>(fn: () => Promise<T>): Promise<T> {
    return this.schedule(fn, 1);
  }

  /**
   * Get current rate limiter statistics
   */
  getStats() {
    return {
      ...this.stats,
      reservoir: (this.limiter as any).reservoir || 0,
      queued: this.limiter.queued(),
      running: this.limiter.running()
    };
  }

  /**
   * Check if we're approaching rate limit
   */
  isNearLimit(): boolean {
    const reservoir = (this.limiter as any).reservoir;
    return reservoir !== null && reservoir !== undefined && reservoir < 1;
  }

  /**
   * Setup event listeners for monitoring
   */
  private setupEventListeners() {
    // Log when queue gets too high
    this.limiter.on('depleted', () => {
      console.warn('[RATE_LIMIT] Reservoir depleted - subsequent requests will be queued');
    });

    this.limiter.on('dropped', (dropped) => {
      console.error('[RATE_LIMIT] Request dropped from queue', { dropped });
    });

    // Debug logging in development
    if (process.env.NODE_ENV !== 'production') {
      this.limiter.on('queued', (info) => {
        console.log('[RATE_LIMIT] Request queued', {
          priority: info.options.priority,
          queued: this.limiter.queued()
        });
      });

      this.limiter.on('scheduled', () => {
        console.log('[RATE_LIMIT] Request scheduled', {
          running: this.limiter.running(),
          reservoir: (this.limiter as any).reservoir || 0
        });
      });
    }
  }
}

// Export singleton instance for Notion API rate limiting
export const notionRateLimiter = new NotionRateLimiter();