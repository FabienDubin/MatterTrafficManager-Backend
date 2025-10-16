import { RedisService, createRedisService } from '../../../src/services/redis.service';

// Mock cache metrics service
jest.mock('../../../src/services/cache-metrics.service', () => ({
  cacheMetricsService: {
    recordHit: jest.fn(),
    recordMiss: jest.fn(),
  }
}));

// Mock logger
jest.mock('../../../src/config/logger.config', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Helper pour créer un mock Redis complet
const createMockRedis = () => ({
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
  ping: jest.fn(),
  flushdb: jest.fn(),
  ttl: jest.fn(),
});

describe('RedisService', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;
  let service: RedisService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = createMockRedis();
    service = createRedisService(mockRedis);
  });

  describe('Cache Operations', () => {
    it('should handle cache hit correctly', async () => {
      const testData = { id: 1, name: 'Test Task' };
      mockRedis.get.mockResolvedValue(JSON.stringify(testData));

      const result = await service.get('tasks:1');

      expect(result).toEqual(testData);
      expect(mockRedis.get).toHaveBeenCalledWith('tasks:1');
    });

    it('should handle cache miss with fallback function', async () => {
      const fallbackData = { id: 1, name: 'Fallback Task' };
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const fallbackFn = jest.fn().mockResolvedValue(fallbackData);
      const result = await service.get('tasks:1', fallbackFn);

      expect(result).toEqual(fallbackData);
      expect(fallbackFn).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'tasks:1', 
        3600, // Default TTL for tasks
        JSON.stringify(fallbackData)
      );
    });

    it('should handle cache miss without fallback', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.get('tasks:1');

      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith('tasks:1');
    });

    it('should handle Redis errors gracefully with fallback', async () => {
      const fallbackData = 'fallback-value';
      mockRedis.get.mockRejectedValue(new Error('Redis connection error'));
      const fallbackFn = jest.fn().mockResolvedValue(fallbackData);

      const result = await service.get('test:key', fallbackFn);

      expect(result).toBe(fallbackData);
      expect(fallbackFn).toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully without fallback', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection error'));

      const result = await service.get('test:key');

      expect(result).toBeNull();
    });
  });

  describe('Set Operations', () => {
    it('should set data with correct TTL for tasks', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      const testData = { id: 1, name: 'Test Task' };

      await service.set('tasks:1', testData, 'tasks');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'tasks:1',
        3600, // TTL for tasks
        JSON.stringify(testData)
      );
    });

    it('should set data with correct TTL for projects', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      const testData = { id: 1, name: 'Test Project' };

      await service.set('projects:1', testData, 'projects');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'projects:1',
        86400, // TTL for projects (24h)
        JSON.stringify(testData)
      );
    });

    it('should use default TTL when entity type is unknown', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      const testData = { id: 1, name: 'Test Data' };

      await service.set('unknown:1', testData, 'unknown');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'unknown:1',
        3600, // Default TTL
        JSON.stringify(testData)
      );
    });

    it('should handle set errors gracefully', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis set error'));

      await expect(service.set('test:key', 'test-value')).resolves.not.toThrow();
    });
  });

  describe('Delete Operations', () => {
    it('should delete single key', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.del('tasks:1');

      expect(mockRedis.del).toHaveBeenCalledWith('tasks:1');
    });

    it('should handle del errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis del error'));

      await expect(service.del('test:key')).resolves.not.toThrow();
    });

    it('should delete key and return success status', async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await service.delete('tasks:1');

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('tasks:1');
    });

    it('should return false when key does not exist', async () => {
      mockRedis.del.mockResolvedValue(0);

      const result = await service.delete('tasks:nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('Pattern Invalidation', () => {
    it('should invalidate keys by pattern using SCAN', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['0', ['tasks:1', 'tasks:2', 'tasks:list']])
        .mockResolvedValueOnce(['0', []]);
      mockRedis.del.mockResolvedValue(3);

      await service.invalidatePattern('tasks:*');

      expect(mockRedis.scan).toHaveBeenCalledWith(0, {
        match: 'tasks:*',
        count: 100
      });
      expect(mockRedis.del).toHaveBeenCalledWith('tasks:1', 'tasks:2', 'tasks:list');
    });

    it('should handle multiple SCAN iterations', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['1', ['tasks:1', 'tasks:2']])
        .mockResolvedValueOnce(['0', ['tasks:3', 'tasks:4']])
        .mockResolvedValueOnce(['0', []]);
      mockRedis.del.mockResolvedValue(4);

      await service.invalidatePattern('tasks:*');

      expect(mockRedis.scan).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenCalledWith('tasks:1', 'tasks:2', 'tasks:3', 'tasks:4');
    });

    it('should use fallback invalidation when SCAN fails', async () => {
      mockRedis.scan.mockRejectedValue(new Error('SCAN not supported'));
      mockRedis.del.mockResolvedValue(1);

      await service.invalidatePattern('tasks:*');

      expect(mockRedis.del).toHaveBeenCalledWith('tasks:list');
      expect(mockRedis.del).toHaveBeenCalledWith('tasks:list:all:page:1');
      expect(mockRedis.del).toHaveBeenCalledWith('tasks:list:active:page:1');
    });

    it('should handle pattern invalidation errors gracefully', async () => {
      mockRedis.scan.mockRejectedValue(new Error('Redis error'));

      await expect(service.invalidatePattern('tasks:*')).resolves.not.toThrow();
    });
  });

  describe('Clear Operations', () => {
    it('should clear all cache entries', async () => {
      mockRedis.flushdb.mockResolvedValue('OK');

      await service.clear();

      expect(mockRedis.flushdb).toHaveBeenCalled();
    });

    it('should throw error when clear fails', async () => {
      mockRedis.flushdb.mockRejectedValue(new Error('Flush failed'));

      await expect(service.clear()).rejects.toThrow('Flush failed');
    });
  });

  describe('Keys Operations', () => {
    it('should get all keys matching pattern', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['1', ['tasks:1', 'tasks:2']])
        .mockResolvedValueOnce(['0', ['tasks:3']]);

      const keys = await service.keys('tasks:*');

      expect(keys).toEqual(['tasks:1', 'tasks:2', 'tasks:3']);
    });

    it('should handle keys operation errors', async () => {
      mockRedis.scan.mockRejectedValue(new Error('Scan error'));

      const keys = await service.keys('tasks:*');

      expect(keys).toEqual([]);
    });
  });

  describe('TTL Operations', () => {
    it('should get TTL for key', async () => {
      mockRedis.ttl.mockResolvedValue(3600);

      const ttl = await service.ttl('tasks:1');

      expect(ttl).toBe(3600);
      expect(mockRedis.ttl).toHaveBeenCalledWith('tasks:1');
    });

    it('should handle TTL errors gracefully', async () => {
      mockRedis.ttl.mockRejectedValue(new Error('TTL error'));

      const ttl = await service.ttl('tasks:1');

      expect(ttl).toBe(-1);
    });
  });

  describe('Health Check', () => {
    it('should return healthy when ping succeeds', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      const health = await service.healthCheck();

      expect(health).toEqual({ status: 'healthy' });
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should return unhealthy when ping fails', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'));

      const health = await service.healthCheck();

      expect(health).toEqual({
        status: 'unhealthy',
        message: 'Connection failed'
      });
    });
  });

  describe('Notion Data Operations', () => {
    it('should cache Notion data with correct key format', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      const testData = { id: '1', title: 'Test Page' };

      await service.cacheNotionData('pages', '1', testData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'pages:1',
        3600, // Default TTL
        JSON.stringify(testData)
      );
    });

    it('should get Notion data with fallback', async () => {
      const fallbackData = { id: '1', title: 'Fallback Page' };
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      const fetchFn = jest.fn().mockResolvedValue(fallbackData);

      const result = await service.getNotionData('pages', '1', fetchFn);

      expect(result).toEqual(fallbackData);
      expect(fetchFn).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('List Caching', () => {
    it('should cache list data with pagination', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      const testData = [{ id: 1 }, { id: 2 }];

      await service.cacheList('tasks', 'active', testData, 2);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'tasks:list:active:page:2',
        3600,
        JSON.stringify(testData)
      );
    });

    it('should get cached list with default page', async () => {
      const testData = [{ id: 1 }, { id: 2 }];
      mockRedis.get.mockResolvedValue(JSON.stringify(testData));

      const result = await service.getCachedList('tasks', 'active');

      expect(result).toEqual(testData);
      expect(mockRedis.get).toHaveBeenCalledWith('tasks:list:active:page:1');
    });
  });

  describe('Entity Cache Operations', () => {
    it('should clear entity cache by type', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', ['tasks:1', 'tasks:2']]);
      mockRedis.del.mockResolvedValue(2);

      await service.clearEntityCache('tasks');

      expect(mockRedis.scan).toHaveBeenCalledWith(0, {
        match: 'tasks:*',
        count: 100
      });
      expect(mockRedis.del).toHaveBeenCalledWith('tasks:1', 'tasks:2');
    });
  });

  describe('Disconnected State', () => {
    let disconnectedService: RedisService;

    beforeEach(() => {
      // Service sans client Redis (mode dégradé)
      disconnectedService = createRedisService();
      // Simulate environment without Redis config
      (disconnectedService as any).isConnected = false;
    });

    it('should return null for get operations when disconnected', async () => {
      const result = await disconnectedService.get('test:key');
      expect(result).toBeNull();
    });

    it('should call fallback function when disconnected', async () => {
      const fallbackFn = jest.fn().mockResolvedValue('fallback-data');
      const result = await disconnectedService.get('test:key', fallbackFn);
      
      expect(fallbackFn).toHaveBeenCalled();
      expect(result).toBe('fallback-data');
    });

    it('should return disconnected status for health check', async () => {
      const health = await disconnectedService.healthCheck();
      expect(health).toEqual({
        status: 'disconnected',
        message: 'Redis not configured'
      });
    });

    it('should handle set operations gracefully when disconnected', async () => {
      await expect(disconnectedService.set('test:key', 'value')).resolves.not.toThrow();
    });

    it('should handle delete operations gracefully when disconnected', async () => {
      await expect(disconnectedService.del('test:key')).resolves.not.toThrow();
    });

    it('should return empty array for keys when disconnected', async () => {
      const keys = await disconnectedService.keys('test:*');
      expect(keys).toEqual([]);
    });

    it('should return -1 for TTL when disconnected', async () => {
      const ttl = await disconnectedService.ttl('test:key');
      expect(ttl).toBe(-1);
    });
  });
});