import { z } from 'zod';

/**
 * Environment variables validation schema
 * Ensures all required environment variables are present and valid
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).refine(port => port > 0 && port < 65536, {
    message: 'PORT must be a valid port number (1-65535)'
  }).default('3000'),
  MONGODB_URI: z.string().url().optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  API_BASE_URL: z.string().url().optional(),
});

/**
 * Validate and parse environment variables
 */
export const validateEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Environment validation failed:', error);
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        console.error(`- ${err.path.join('.')}: ${err.message}`);
      });
    }
    process.exit(1);
  }
};

export type EnvConfig = z.infer<typeof envSchema>;