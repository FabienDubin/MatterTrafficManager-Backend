import { RedisService } from '../../../src/services/redis.service';

// Mock Upstash Redis
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
  flushdb: jest.fn(),
  ttl: jest.fn(),
  ping: jest.fn(),
};

jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => mockRedis)
}));

// Mock cache metrics service
jest.mock('../../../src/services/cache-metrics.service', () => ({
  cacheMetricsService: {
    recordHit: jest.fn(),
    recordMiss: jest.fn(),
  }
}));

// Set environment variables before importing to ensure connection
process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

describe('RedisService', () => {
  let redisService: RedisService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create new instance for each test
    redisService = new RedisService();
  });

  describe('Cache Operations', () => {
    it('should handle cache hit correctly', async () => {
      const key = 'test:key';
      const cachedData = { data: 'test' };
      
      // Mock successful cache hit
      mockRedis.get.mockResolvedValue(cachedData);

      const result = await redisService.get(key);

      expect(mockRedis.get).toHaveBeenCalledWith(key);
      expect(result).toEqual(cachedData);
    });

    it('should handle cache miss with fallback function', async () => {
      const key = 'test:key';
      const fallbackData = { data: 'fallback' };
      const fallbackFn = jest.fn().mockResolvedValue(fallbackData);
      
      // Mock cache miss
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const result = await redisService.get(key, fallbackFn);

      expect(mockRedis.get).toHaveBeenCalledWith(key);
      expect(fallbackFn).toHaveBeenCalled();
      expect(result).toEqual(fallbackData);
      // Should set the data in cache after fallback
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should handle cache miss without fallback function', async () => {
      const key = 'test:key';
      
      // Mock cache miss
      mockRedis.get.mockResolvedValue(null);

      const result = await redisService.get(key);

      expect(mockRedis.get).toHaveBeenCalledWith(key);
      expect(result).toBeNull();
    });

    it('should set data with correct TTL', async () => {
      const key = 'tasks:test';
      const value = { data: 'test' };
      const expectedTTL = 3600; // Default TTL for tasks
      
      mockRedis.setex.mockResolvedValue('OK');

      await redisService.set(key, value);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        key,
        expectedTTL,
        JSON.stringify(value)
      );
    });

    it('should set data with custom entity type TTL', async () => {
      const key = 'custom:test';
      const value = { data: 'test' };
      const entityType = 'members';
      const expectedTTL = 604800; // TTL for members (1 week)
      
      mockRedis.setex.mockResolvedValue('OK');

      await redisService.set(key, value, entityType);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        key,
        expectedTTL,
        JSON.stringify(value)
      );
    });

    it('should delete key correctly', async () => {
      const key = 'test:key';
      
      mockRedis.del.mockResolvedValue(1);

      await redisService.del(key);

      expect(mockRedis.del).toHaveBeenCalledWith(key);
    });
  });

  describe('Pattern Invalidation', () => {
    it('should invalidate cache by pattern using SCAN', async () => {
      const pattern = 'tasks:*';
      const mockKeys = ['tasks:1', 'tasks:2', 'tasks:list'];
      
      // Mock SCAN response
      mockRedis.scan.mockResolvedValue([0, mockKeys]);
      mockRedis.del.mockResolvedValue(3);

      await redisService.invalidatePattern(pattern);

      expect(mockRedis.scan).toHaveBeenCalledWith(0, {
        match: pattern,
        count: 100
      });
      expect(mockRedis.del).toHaveBeenCalledWith(...mockKeys);
    });

    it('should handle SCAN pagination correctly', async () => {
      const pattern = 'tasks:*';
      const mockKeys1 = ['tasks:1', 'tasks:2'];
      const mockKeys2 = ['tasks:3', 'tasks:4'];
      
      // Mock SCAN with pagination
      mockRedis.scan
        .mockResolvedValueOnce([1, mockKeys1]) // First call with cursor 1
        .mockResolvedValueOnce([0, mockKeys2]); // Second call with cursor 0 (end)
      
      mockRedis.del.mockResolvedValue(4);

      await redisService.invalidatePattern(pattern);

      expect(mockRedis.scan).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenCalledWith(...mockKeys1.concat(mockKeys2));
    });

    it('should fallback to known patterns when SCAN fails', async () => {
      const pattern = 'tasks:*';
      
      // Mock SCAN failure
      mockRedis.scan.mockRejectedValue(new Error('SCAN not supported'));
      mockRedis.del.mockResolvedValue(1);

      await redisService.invalidatePattern(pattern);

      // Should try common keys for the entity type
      expect(mockRedis.del).toHaveBeenCalledWith('tasks:list');
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection failure gracefully', async () => {
      const key = 'test:key';
      const fallbackData = { data: 'fallback' };
      const fallbackFn = jest.fn().mockResolvedValue(fallbackData);
      
      // Mock Redis connection error
      mockRedis.get.mockRejectedValue(new Error('Connection refused'));

      const result = await redisService.get(key, fallbackFn);

      expect(result).toEqual(fallbackData);
      expect(fallbackFn).toHaveBeenCalled();
    });

    it('should handle Redis set error gracefully', async () => {
      const key = 'test:key';
      const value = { data: 'test' };
      
      // Mock Redis set error
      mockRedis.setex.mockRejectedValue(new Error('Set failed'));

      // Should not throw error
      await expect(redisService.set(key, value)).resolves.not.toThrow();
    });

    it('should handle Redis delete error gracefully', async () => {
      const key = 'test:key';
      
      // Mock Redis delete error
      mockRedis.del.mockRejectedValue(new Error('Delete failed'));

      // Should not throw error
      await expect(redisService.del(key)).resolves.not.toThrow();
    });
  });

  describe('TTL Management', () => {
    it('should return correct TTL for existing key', async () => {
      const key = 'test:key';
      const mockTTL = 3600;
      
      mockRedis.ttl.mockResolvedValue(mockTTL);

      const ttl = await redisService.ttl(key);

      expect(mockRedis.ttl).toHaveBeenCalledWith(key);
      expect(ttl).toBe(mockTTL);
    });

    it('should handle TTL error and return -1', async () => {
      const key = 'test:key';
      
      mockRedis.ttl.mockRejectedValue(new Error('TTL failed'));

      const ttl = await redisService.ttl(key);

      expect(ttl).toBe(-1);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when Redis responds', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      const health = await redisService.healthCheck();

      expect(mockRedis.ping).toHaveBeenCalled();
      expect(health).toEqual({ status: 'healthy' });
    });

    it('should return unhealthy status when Redis fails', async () => {
      const error = new Error('Connection timeout');
      mockRedis.ping.mockRejectedValue(error);

      const health = await redisService.healthCheck();

      expect(health).toEqual({
        status: 'unhealthy',
        message: 'Connection timeout'
      });
    });
  });

  describe('Disconnected State', () => {
    let disconnectedService: RedisService;
    
    beforeEach(() => {
      // Create a service without environment variables
      const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
      const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
      
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      
      disconnectedService = new RedisService();
      
      // Restore environment variables
      if (originalUrl) process.env.UPSTASH_REDIS_REST_URL = originalUrl;
      if (originalToken) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    });

    it('should fallback gracefully when not connected', async () => {
      const key = 'test:key';
      const fallbackData = { data: 'fallback' };
      const fallbackFn = jest.fn().mockResolvedValue(fallbackData);

      const result = await disconnectedService.get(key, fallbackFn);

      expect(result).toEqual(fallbackData);
      expect(fallbackFn).toHaveBeenCalled();
      // Should not call Redis when not connected
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('should return null when not connected and no fallback', async () => {
      const key = 'test:key';

      const result = await disconnectedService.get(key);

      expect(result).toBeNull();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('should return disconnected status for health check', async () => {
      const health = await disconnectedService.healthCheck();

      expect(health).toEqual({
        status: 'disconnected',
        message: 'Redis not configured'
      });
    });
  });

  describe('Notion Data Caching', () => {
    it('should cache Notion data with correct key format', async () => {
      const type = 'tasks';
      const id = 'notion-task-id';
      const data = { title: 'Test Task', id };
      
      mockRedis.setex.mockResolvedValue('OK');

      await redisService.cacheNotionData(type, id, data);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `${type}:${id}`,
        3600, // Default TTL for tasks
        JSON.stringify(data)
      );
    });

    it('should get Notion data with fallback', async () => {
      const type = 'projects';
      const id = 'notion-project-id';
      const fallbackData = { title: 'Test Project', id };
      const fetchFn = jest.fn().mockResolvedValue(fallbackData);
      
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const result = await redisService.getNotionData(type, id, fetchFn);

      expect(mockRedis.get).toHaveBeenCalledWith(`${type}:${id}`);
      expect(fetchFn).toHaveBeenCalled();
      expect(result).toEqual(fallbackData);
    });
  });

  describe('List Caching', () => {
    it('should cache list data with pagination key', async () => {
      const type = 'tasks';
      const identifier = 'active';
      const data = [{ id: '1' }, { id: '2' }];
      const page = 1;
      
      mockRedis.setex.mockResolvedValue('OK');

      await redisService.cacheList(type, identifier, data, page);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `${type}:list:${identifier}:page:${page}`,
        3600,
        JSON.stringify(data)
      );
    });

    it('should get cached list data', async () => {
      const type = 'tasks';
      const identifier = 'active';
      const page = 1;
      const cachedData = [{ id: '1' }, { id: '2' }];
      
      mockRedis.get.mockResolvedValue(cachedData);

      const result = await redisService.getCachedList(type, identifier, page);

      expect(mockRedis.get).toHaveBeenCalledWith(
        `${type}:list:${identifier}:page:${page}`
      );
      expect(result).toEqual(cachedData);
    });
  });
});