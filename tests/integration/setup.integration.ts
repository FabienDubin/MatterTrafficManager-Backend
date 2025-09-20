// Setup for integration tests
import mongoose from 'mongoose';
import { redisService } from '../../src/services/redis.service';

// Mock Redis service for integration tests
jest.mock('../../src/services/redis.service', () => ({
  redisService: {
    healthCheck: jest.fn().mockResolvedValue({
      status: 'healthy',
      message: 'Redis mocked for tests'
    })
  }
}));

// Mock MongoDB admin ping
beforeAll(async () => {
  // Mock the admin ping method for MongoDB
  if (mongoose.connection.db) {
    jest.spyOn(mongoose.connection.db.admin(), 'ping').mockResolvedValue({ ok: 1 });
  } else {
    // Create a mock structure if db doesn't exist
    mongoose.connection.db = {
      admin: jest.fn().mockReturnValue({
        ping: jest.fn().mockResolvedValue({ ok: 1 })
      })
    } as any;
  }
  
  // Ensure readyState is set to connected
  Object.defineProperty(mongoose.connection, 'readyState', {
    value: 1, // 1 = connected
    writable: true,
    configurable: true
  });
});

// Clean up after tests
afterAll(async () => {
  // Close any open handles
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  
  // Clear all timers and intervals
  jest.clearAllTimers();
  jest.useRealTimers();
});

// Increase global test timeout for integration tests
jest.setTimeout(15000);

export {};