import Bottleneck from 'bottleneck';
import {
  throttledNotionCall,
  batchNotionCalls,
  getRateLimiterStats
} from '../../../src/services/rateLimiter.service';

jest.mock('bottleneck');
jest.mock('../../../src/config/logger.config', () => ({
  default: {
    debug: jest.fn(),
    error: jest.fn()
  }
}));

describe('RateLimiterService', () => {
  let mockBottleneck: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockBottleneck = {
      schedule: jest.fn(),
      counts: jest.fn(),
      reservoir: jest.fn()
    };
    
    (Bottleneck as jest.Mock).mockImplementation(() => mockBottleneck);
  });

  describe('throttledNotionCall', () => {
    it('should execute function through rate limiter', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      mockBottleneck.schedule.mockImplementation((fn: any) => fn());

      const result = await throttledNotionCall(mockFn, 'testOperation');

      expect(result).toBe('result');
      expect(mockBottleneck.schedule).toHaveBeenCalledWith(mockFn);
      expect(mockFn).toHaveBeenCalled();
    });

    it('should handle function execution errors', async () => {
      const error = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(error);
      mockBottleneck.schedule.mockImplementation((fn: any) => fn());

      await expect(
        throttledNotionCall(mockFn, 'testOperation')
      ).rejects.toThrow(error);
    });

    it('should log when rate limiter delays request', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      
      mockBottleneck.schedule.mockImplementation(async (fn: any) => {
        await new Promise(resolve => setTimeout(resolve, 150));
        return fn();
      });

      await throttledNotionCall(mockFn, 'testOperation');
      
      // Due to the delay, the logger should have been called
      const logger = require('../../../src/config/logger.config').default;
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('batchNotionCalls', () => {
    it('should execute calls in batches', async () => {
      const calls = [
        jest.fn().mockResolvedValue('result1'),
        jest.fn().mockResolvedValue('result2'),
        jest.fn().mockResolvedValue('result3'),
        jest.fn().mockResolvedValue('result4')
      ];

      mockBottleneck.schedule.mockImplementation((fn: any) => fn());

      const results = await batchNotionCalls(calls, 2);

      expect(results).toEqual(['result1', 'result2', 'result3', 'result4']);
      expect(calls[0]).toHaveBeenCalled();
      expect(calls[1]).toHaveBeenCalled();
      expect(calls[2]).toHaveBeenCalled();
      expect(calls[3]).toHaveBeenCalled();
    });

    it('should handle errors in batch calls', async () => {
      const error = new Error('Batch error');
      const calls = [
        jest.fn().mockResolvedValue('result1'),
        jest.fn().mockRejectedValue(error)
      ];

      mockBottleneck.schedule.mockImplementation((fn: any) => fn());

      await expect(batchNotionCalls(calls, 2)).rejects.toThrow(error);
    });

    it('should add delay between batches', async () => {
      const calls = Array(6)
        .fill(null)
        .map((_, i) => jest.fn().mockResolvedValue(`result${i}`));

      mockBottleneck.schedule.mockImplementation((fn: any) => fn());

      const startTime = Date.now();
      await batchNotionCalls(calls, 3);
      const duration = Date.now() - startTime;

      // Should have 1 second delay between batches (2 batches total)
      expect(duration).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('getRateLimiterStats', () => {
    it('should return rate limiter statistics', () => {
      mockBottleneck.counts.mockReturnValue({
        RECEIVED: 5,
        QUEUED: 2,
        RUNNING: 1,
        DONE: 10
      });

      const stats = getRateLimiterStats();

      expect(stats).toEqual({
        remainingTokens: 5,
        tokensPerInterval: 3,
        interval: 'second'
      });
      expect(mockBottleneck.counts).toHaveBeenCalled();
    });

    it('should handle undefined counts', () => {
      mockBottleneck.counts.mockReturnValue({});

      const stats = getRateLimiterStats();

      expect(stats.remainingTokens).toBeDefined();
      expect(stats.tokensPerInterval).toBe(3);
      expect(stats.interval).toBe('second');
    });
  });
});