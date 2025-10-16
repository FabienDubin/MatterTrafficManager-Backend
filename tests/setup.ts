// Global test setup
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Mock Redis globally with ioredis-mock
jest.mock('ioredis', () => require('ioredis-mock'));

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

// No direct logger in utils to mock

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  // Setup MongoDB in-memory for tests
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Connect to in-memory MongoDB
  await mongoose.connect(mongoUri);
}, 30000); // 30 second timeout for MongoDB setup

afterEach(async () => {
  // Clean up collections after each test
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  // Cleanup
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
  jest.restoreAllMocks();
});