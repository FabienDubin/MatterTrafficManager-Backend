import { validateEnv, envSchema } from '../../../src/validators/env.validator';

describe('Environment Validator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('envSchema', () => {
    it('should validate valid environment variables', () => {
      const validEnv = {
        NODE_ENV: 'development',
        PORT: '3000',
        MONGODB_URI: 'mongodb://localhost:27017/test',
        FRONTEND_URL: 'http://localhost:5173',
        LOG_LEVEL: 'info',
        API_BASE_URL: 'http://localhost:3000/api/v1',
      };

      const result = envSchema.parse(validEnv);

      expect(result).toMatchObject({
        NODE_ENV: 'development',
        PORT: 3000,
        MONGODB_URI: 'mongodb://localhost:27017/test',
        FRONTEND_URL: 'http://localhost:5173',
        LOG_LEVEL: 'info',
        API_BASE_URL: 'http://localhost:3000/api/v1',
      });
    });

    it('should apply defaults for missing optional variables', () => {
      const minimalEnv = {};

      const result = envSchema.parse(minimalEnv);

      expect(result).toMatchObject({
        NODE_ENV: 'development',
        PORT: 3000,
        FRONTEND_URL: 'http://localhost:5173',
        LOG_LEVEL: 'info',
      });
    });

    it('should reject invalid NODE_ENV values', () => {
      const invalidEnv = {
        NODE_ENV: 'invalid',
      };

      expect(() => envSchema.parse(invalidEnv)).toThrow();
    });

    it('should reject invalid PORT values', () => {
      const invalidEnv = {
        PORT: '99999',
      };

      expect(() => envSchema.parse(invalidEnv)).toThrow();
    });

    it('should reject invalid URL formats', () => {
      const invalidEnv = {
        MONGODB_URI: 'not-a-url',
      };

      expect(() => envSchema.parse(invalidEnv)).toThrow();
    });
  });

  describe('validateEnv', () => {
    it('should return parsed environment variables on success', () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = '3001';

      const result = validateEnv();

      expect(result).toMatchObject({
        NODE_ENV: 'test',
        PORT: 3001,
      });
    });

    it('should exit process on validation failure', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });
      const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

      process.env.PORT = 'invalid-port';

      expect(() => validateEnv()).toThrow('Process exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalled();

      mockExit.mockRestore();
      mockConsoleError.mockRestore();
    });
  });
});