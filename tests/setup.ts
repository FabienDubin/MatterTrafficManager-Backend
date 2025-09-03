// Global test setup
import mongoose from 'mongoose';

// Mock logger globally
jest.mock('../src/config/logger.config', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock mongoose connection for all tests
beforeAll(async () => {
  // Mock MongoDB connection
  jest.spyOn(mongoose, 'connect').mockImplementation(() => Promise.resolve() as any);
  
  // Mock readyState property
  Object.defineProperty(mongoose.connection, 'readyState', {
    value: 1,
    writable: true,
    configurable: true
  });
});

afterAll(async () => {
  jest.restoreAllMocks();
});