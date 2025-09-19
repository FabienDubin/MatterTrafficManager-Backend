import dotenv from 'dotenv';
import path from 'path';
import { Redis } from '@upstash/redis';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function clearRedisCache() {
  console.log('\n🧹 CLEARING REDIS CACHE\n');
  console.log('=====================================\n');
  
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || ''
  });

  try {
    // Flush all data
    console.log('Flushing all Redis data...');
    await redis.flushall();
    console.log('✅ Redis cache cleared successfully!\n');
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
  }
  
  process.exit(0);
}

clearRedisCache();