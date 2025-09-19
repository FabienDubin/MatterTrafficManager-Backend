import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Now import services after env vars are loaded
import { RedisService } from '../services/redis.service';
import notionService from '../services/notion.service';
import logger from '../config/logger.config';

// Create a new instance with loaded env vars
const redisService = new RedisService();

/**
 * Script de test pour vérifier que Redis fonctionne avec Notion
 */
async function testRedisWithNotion() {
  console.log('\n🚀 Test Redis + Notion Integration\n');
  console.log('=====================================\n');

  try {
    // 1. Test Redis Health
    console.log('1️⃣  Testing Redis connection...');
    const healthCheck = await redisService.healthCheck();
    console.log(`   ✅ Redis status: ${healthCheck.status}`);
    if (healthCheck.message) {
      console.log(`   ℹ️  Message: ${healthCheck.message}`);
    }
    console.log('');

    // 2. Test simple cache set/get
    console.log('2️⃣  Testing basic cache operations...');
    const testData = { id: 'test-123', name: 'Test Item', timestamp: new Date().toISOString() };
    await redisService.set('test:item', testData, 'test');
    const retrieved = await redisService.get('test:item');
    console.log(
      `   ✅ Cache write/read: ${JSON.stringify(retrieved) === JSON.stringify(testData) ? 'SUCCESS' : 'FAILED'}`
    );
    console.log('');

    // 3. Query Notion and cache data
    console.log('3️⃣  Fetching data from Notion databases...');

    // Test with Projects database
    const projectsDbId = process.env.NOTION_DB_PROJECTS;
    if (projectsDbId) {
      console.log(`   📊 Querying Projects database (${projectsDbId})...`);

      // First call - will hit Notion API
      const startTime1 = Date.now();
      const projects = await redisService.get(`projects:list:all`, async () => {
        const result = await notionService.queryProjectsDatabase(
          undefined, // filters
          undefined, // cursor
          10 // pageSize
        );
        return result.results;
      });
      const time1 = Date.now() - startTime1;
      console.log(
        `   ✅ First call (Notion API): ${Array.isArray(projects) ? projects.length : 0} projects fetched in ${time1}ms`
      );

      // Second call - should hit Redis cache
      const startTime2 = Date.now();
      const cachedProjects = await redisService.get('projects:list:all');
      const time2 = Date.now() - startTime2;
      console.log(
        `   ✅ Second call (Redis cache): ${Array.isArray(cachedProjects) ? cachedProjects.length : 0} projects fetched in ${time2}ms`
      );
      console.log(
        `   ⚡ Speed improvement: ${Math.round(((time1 - time2) / time1) * 100)}% faster!`
      );
    }
    console.log('');

    // Test with Tasks database
    const tasksDbId = process.env.NOTION_DB_TRAFFIC;
    if (tasksDbId) {
      console.log(`   📊 Querying Tasks database (${tasksDbId})...`);

      // Cache with TTL
      const tasks = await redisService.get(`tasks:list:recent`, async () => {
        const result = await notionService.queryTrafficDatabase(
          undefined, // cursor
          5 // pageSize
        );
        return result.results;
      });
      console.log(`   ✅ Tasks cached: ${Array.isArray(tasks) ? tasks.length : 0} items`);
    }
    console.log('');

    // 4. Display a sample cached project
    console.log('4️⃣  Sample cached project data...');
    const cachedProjectsSample = await redisService.get('projects:list:all');
    if (Array.isArray(cachedProjectsSample) && cachedProjectsSample.length > 0) {
      const firstProject = cachedProjectsSample[0];
      console.log('   📁 First project from cache:');
      console.log('   ├── ID:', firstProject.id);
      console.log(
        '   ├── Title:',
        firstProject.properties?.['%3FJe%3C']?.title?.[0]?.plain_text || 'N/A'
      );
      console.log('   ├── Status:', firstProject.properties?.['E%60o%5B']?.select?.name || 'N/A');
      console.log('   ├── Created:', firstProject.created_time);
      console.log('   └── Last edited:', firstProject.last_edited_time);
      console.log('🥳 First Project id', firstProject);
      // Show full object in JSON for debugging
      console.log('\n   📋 Full object structure:');
      console.log(
        JSON.stringify(firstProject, null, 2)
          .split('\n')
          .slice(0, 30)
          .map(line => '   ' + line)
          .join('\n')
      );
      if (JSON.stringify(firstProject, null, 2).split('\n').length > 30) {
        console.log('   ... (truncated for readability)');
      }
    } else {
      console.log('   ⚠️  No projects found in cache');
    }
    console.log('');

    // 5. Test cache invalidation
    console.log('5️⃣  Testing cache invalidation...');
    await redisService.invalidatePattern('tasks:*');
    const invalidated = await redisService.get('tasks:list:recent');
    console.log(`   ✅ Cache invalidation: ${invalidated === null ? 'SUCCESS' : 'FAILED'}`);
    console.log('');

    // 6. Display cache stats
    console.log('6️⃣  Cache Configuration:');
    console.log(`   ⏱️  Tasks TTL: ${process.env.REDIS_TTL_TASKS || 3600}s`);
    console.log(`   ⏱️  Projects TTL: ${process.env.REDIS_TTL_PROJECTS || 86400}s`);
    console.log(`   ⏱️  Teams TTL: ${process.env.REDIS_TTL_TEAMS || 604800}s`);
    console.log(`   ⏱️  Clients TTL: ${process.env.REDIS_TTL_CLIENTS || 43200}s`);
    console.log('');

    console.log('✅ All tests completed successfully!');
    console.log('=====================================\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
    logger.error('Redis test failed', error);
  } finally {
    // Clean up test data
    await redisService.del('test:item');
    process.exit(0);
  }
}

// Run the test
testRedisWithNotion().catch(console.error);
