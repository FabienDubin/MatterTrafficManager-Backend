// Mock Bottleneck before importing the service
const mockSchedule = jest.fn();
const mockCounts = jest.fn();

jest.mock('bottleneck', () => {
  return jest.fn().mockImplementation(() => ({
    schedule: mockSchedule,
    counts: mockCounts
  }));
});

jest.mock('../../../src/config/logger.config', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

import {
  throttledNotionCall,
  batchNotionCalls,
  getRateLimiterStats
} from '../../../src/services/rateLimiter.service';

describe('RateLimiterService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCounts.mockReturnValue({ RECEIVED: 5 });
  });

  describe('throttledNotionCall', () => {
    it('should execute function through rate limiter', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      mockSchedule.mockImplementation((fn: any) => fn());

      const result = await throttledNotionCall(mockFn, 'testOperation');

      expect(result).toBe('result');
      expect(mockSchedule).toHaveBeenCalledWith(mockFn);
      expect(mockFn).toHaveBeenCalled();
    });

    it('should handle function execution errors', async () => {
      const error = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(error);
      mockSchedule.mockImplementation((fn: any) => fn());

      await expect(
        throttledNotionCall(mockFn, 'testOperation')
      ).rejects.toThrow(error);
    });

    it('should log when rate limiter delays request', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      
      // Simulate delay
      mockSchedule.mockImplementation(async (fn: any) => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return fn();
      });

      await throttledNotionCall(mockFn, 'delayedOperation');
      
      // Logger should be called for delay
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

      mockSchedule.mockImplementation((fn: any) => fn());

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

      mockSchedule.mockImplementation((fn: any) => fn());

      await expect(batchNotionCalls(calls, 2)).rejects.toThrow(error);
    });

    it('should add delay between batches', async () => {
      const calls = [
        jest.fn().mockResolvedValue('result1'),
        jest.fn().mockResolvedValue('result2'),
        jest.fn().mockResolvedValue('result3'),
        jest.fn().mockResolvedValue('result4')
      ];

      mockSchedule.mockImplementation((fn: any) => fn());
      
      const start = Date.now();
      await batchNotionCalls(calls, 2);
      const elapsed = Date.now() - start;

      // Should have delay between batches
      expect(elapsed).toBeGreaterThanOrEqual(1000);
      expect(elapsed).toBeLessThan(1500);
    });
  });

  describe('getRateLimiterStats', () => {
    it('should return rate limiter statistics', () => {
      mockCounts.mockReturnValue({ RECEIVED: 3 });

      const stats = getRateLimiterStats();

      expect(stats).toEqual({
        remainingTokens: 3,
        tokensPerInterval: 3,
        interval: 'second'
      });
      expect(mockCounts).toHaveBeenCalled();
    });

    it('should handle undefined counts', () => {
      mockCounts.mockReturnValue(undefined);

      const stats = getRateLimiterStats();

      expect(stats).toEqual({
        remainingTokens: 0,
        tokensPerInterval: 3,
        interval: 'second'
      });
    });
  });
});