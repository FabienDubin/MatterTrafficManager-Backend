import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Now import services after env vars are loaded
import mongoose from 'mongoose';
import notionService from '../services/notion.service';
import { redisService } from '../services/redis.service';
import { conflictService } from '../services/conflict.service';
import logger from '../config/logger.config';

/**
 * Script de test complet pour l'intégration Redis + Notion avec gestion des conflits
 */
async function testCompleteIntegration() {
  console.log('\n🚀 Test Complet : Redis + Notion + Conflicts Integration\n');
  console.log('='.repeat(60) + '\n');

  // Connect to MongoDB first
  try {
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI!, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('   ✅ MongoDB connected successfully\n');
  } catch (error: any) {
    console.error('   ❌ Failed to connect to MongoDB:', error.message);
    console.log('   ⚠️  Continuing without conflict logging...\n');
  }

  const results: any = {
    redisHealth: false,
    cacheHitRate: 0,
    calendarPerformance: {},
    conflictDetection: false,
    webhookIntegration: false,
    totalTime: 0
  };

  const startTime = Date.now();

  try {
    // ===== 1. TEST REDIS HEALTH =====
    console.log('1️⃣  Testing Redis Health...');
    const healthCheck = await redisService.healthCheck();
    results.redisHealth = healthCheck.status === 'healthy';
    console.log(`   ${results.redisHealth ? '✅' : '❌'} Redis: ${healthCheck.status}`);
    console.log('');

    // ===== 2. TEST CACHE WARMUP =====
    console.log('2️⃣  Testing Cache Warmup...');
    const warmupStart = Date.now();
    await notionService.warmupCache();
    const warmupTime = Date.now() - warmupStart;
    console.log(`   ✅ Cache warmup completed in ${warmupTime}ms`);
    console.log('');

    // ===== 3. TEST CALENDAR VIEW PERFORMANCE =====
    console.log('3️⃣  Testing Calendar View Performance & Data Integrity...');
    
    // Clear cache first
    await redisService.invalidatePattern('tasks:calendar:*');
    
    // Test date range
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 7);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 7);
    
    console.log(`   📅 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    
    // First call - should hit Notion API
    const apiStart = Date.now();
    const tasksFromAPI = await notionService.getTasksForCalendarView(startDate, endDate);
    const apiTime = Date.now() - apiStart;
    
    // Second call - should hit cache
    const cacheStart = Date.now();
    const tasksFromCache = await notionService.getTasksForCalendarView(startDate, endDate);
    const cacheTime = Date.now() - cacheStart;
    
    results.calendarPerformance = {
      apiTime,
      cacheTime,
      speedImprovement: Math.round(((apiTime - cacheTime) / apiTime) * 100),
      tasksCount: tasksFromAPI.length
    };
    
    console.log(`   📊 API call: ${apiTime}ms for ${tasksFromAPI.length} tasks`);
    console.log(`   ⚡ Cache call: ${cacheTime}ms`);
    console.log(`   🚀 Speed improvement: ${results.calendarPerformance.speedImprovement}%`);
    
    // AFFICHER LES VRAIES DONNÉES NOTION
    console.log('\n   📋 Sample Tasks from Notion:');
    if (tasksFromAPI.length > 0) {
      // Afficher les 3 premières tâches
      const samplesToShow = Math.min(3, tasksFromAPI.length);
      for (let i = 0; i < samplesToShow; i++) {
        const task = tasksFromAPI[i];
        if (!task) continue;
        console.log(`\n   Task ${i + 1}:`);
        console.log(`   ├── ID: ${task.id}`);
        console.log(`   ├── Title: ${task.title || 'N/A'}`);
        console.log(`   ├── Status: ${task.status || 'N/A'}`);
        console.log(`   ├── Work Period: ${task.workPeriod?.startDate || 'N/A'} to ${task.workPeriod?.endDate || 'N/A'}`);
        console.log(`   ├── Type: ${task.taskType || 'N/A'}`);
        console.log(`   ├── Project: ${task.projectId || 'N/A'}`);
        console.log(`   ├── Assigned Members: ${task.assignedMembers?.join(', ') || 'N/A'}`);
        console.log(`   ├── Client: ${task.client || 'N/A'}`);
        console.log(`   ├── Teams: ${task.teams?.join(', ') || 'N/A'}`);
        console.log(`   └── Last updated: ${task.updatedAt}`);
      }
      
      // Vérifier l'intégrité des données entre API et Cache
      console.log('\n   🔍 Data Integrity Check (API vs Cache):');
      const dataMatch = JSON.stringify(tasksFromAPI) === JSON.stringify(tasksFromCache);
      console.log(`   ${dataMatch ? '✅' : '❌'} Data integrity: ${dataMatch ? 'Perfect match' : 'Mismatch detected!'}`);
      
      if (!dataMatch) {
        console.log('   ⚠️  WARNING: Cache data differs from API data!');
      }
    } else {
      console.log('   ⚠️  No tasks found in the specified date range');
    }
    console.log('');

    // ===== 4. TEST INDIVIDUAL TASK CACHE =====
    console.log('4️⃣  Testing Individual Task Cache & Full Data...');
    
    if (tasksFromAPI.length > 0 && tasksFromAPI[0]) {
      const testTaskId = tasksFromAPI[0].id;
      
      // Clear specific task cache
      await redisService.del(`task:${testTaskId}`);
      
      // First call - API
      const taskApiStart = Date.now();
      const taskFromAPI = await notionService.getTask(testTaskId);
      const taskApiTime = Date.now() - taskApiStart;
      
      // Second call - Cache
      const taskCacheStart = Date.now();
      const taskFromCache = await notionService.getTask(testTaskId);
      const taskCacheTime = Date.now() - taskCacheStart;
      
      console.log(`   📄 Task API call: ${taskApiTime}ms`);
      console.log(`   ⚡ Task cache call: ${taskCacheTime}ms`);
      console.log(`   ✅ Cache working: ${taskCacheTime < taskApiTime}`);
      
      // Afficher les données complètes de la tâche
      console.log('\n   📋 Full Task Data from Notion:');
      console.log(`   ├── ID: ${taskFromAPI.id}`);
      console.log(`   ├── Title: ${taskFromAPI.title || 'N/A'}`);
      console.log(`   ├── Status: ${taskFromAPI.status || 'N/A'}`);
      console.log(`   ├── Task Type: ${taskFromAPI.taskType || 'N/A'}`);
      console.log(`   ├── Work Period:`);
      console.log(`   │   ├── Start: ${taskFromAPI.workPeriod?.startDate || 'N/A'}`);
      console.log(`   │   └── End: ${taskFromAPI.workPeriod?.endDate || 'N/A'}`);
      console.log(`   ├── Notes: ${taskFromAPI.notes?.substring(0, 50) || 'N/A'}${taskFromAPI.notes?.length > 50 ? '...' : ''}`);
      console.log(`   ├── Project ID: ${taskFromAPI.projectId || 'N/A'}`);
      console.log(`   ├── Assigned Members: ${taskFromAPI.assignedMembers?.join(', ') || 'N/A'}`);
      console.log(`   ├── Client: ${taskFromAPI.client || 'N/A'}`);
      console.log(`   ├── Teams: ${taskFromAPI.teams?.join(', ') || 'N/A'}`);
      console.log(`   ├── Billed Hours: ${taskFromAPI.billedHours || 'N/A'}`);
      console.log(`   ├── Actual Hours: ${taskFromAPI.actualHours || 'N/A'}`);
      console.log(`   ├── Add to Calendar: ${taskFromAPI.addToCalendar}`);
      console.log(`   ├── Created: ${taskFromAPI.createdAt}`);
      console.log(`   └── Last updated: ${taskFromAPI.updatedAt}`);
      
      // Vérifier l'intégrité entre API et Cache
      const taskDataMatch = JSON.stringify(taskFromAPI) === JSON.stringify(taskFromCache);
      console.log(`\n   🔍 Individual Task Data Integrity: ${taskDataMatch ? '✅ Perfect match' : '❌ Mismatch!'}`);
    } else {
      console.log('   ⚠️  No tasks available for testing');
    }
    console.log('');

    // ===== 5. TEST CONFLICT DETECTION =====
    console.log('5️⃣  Testing Conflict Detection...');
    
    // Simulate a conflict scenario
    const mockCachedData = {
      id: 'test-123',
      last_edited_time: '2025-01-01T10:00:00.000Z',
      properties: {
        title: 'Old Title'
      }
    };
    
    const mockFreshData = {
      id: 'test-123',
      last_edited_time: '2025-01-01T11:00:00.000Z',
      properties: {
        title: 'New Title'
      }
    };
    
    const conflict = await conflictService.detectConflict(
      'task',
      'test-123',
      mockCachedData,
      mockFreshData
    );
    
    results.conflictDetection = conflict !== null;
    console.log(`   ${results.conflictDetection ? '✅' : '❌'} Conflict detection: ${conflict ? 'Working' : 'Not detected'}`);
    
    if (conflict) {
      const resolved = await conflictService.resolveConflict(conflict, 'notion_wins');
      console.log(`   ✅ Conflict resolution: ${resolved ? 'Success' : 'Failed'}`);
    }
    console.log('');

    // ===== 6. TEST CACHE STATISTICS =====
    console.log('6️⃣  Getting Cache Statistics...');
    const stats = await notionService.getCacheStats();
    
    console.log(`   📊 Cache Status: ${stats.status}`);
    console.log(`   📊 Conflicts (7 days):`);
    console.log(`      - Total: ${stats.conflicts?.total || 0}`);
    console.log(`      - Pending: ${stats.conflicts?.pending || 0}`);
    console.log(`      - Auto-resolved: ${stats.conflicts?.autoResolved || 0}`);
    console.log(`      - Resolution rate: ${Math.round((stats.conflicts?.autoResolveRate || 0) * 100)}%`);
    console.log('');

    // ===== 7. TEST CACHE HIT RATE =====
    console.log('7️⃣  Testing Cache Hit Rate...');
    
    // Make multiple calls and track cache hits
    const testCalls = 10;
    let cacheHits = 0;
    
    for (let i = 0; i < testCalls; i++) {
      const key = `test:hit:${i % 3}`; // Use only 3 keys to ensure some cache hits
      
      // Set some values in cache
      if (i < 3) {
        await redisService.set(key, { value: i }, 'test');
      }
      
      // Try to get them
      const cached = await redisService.get(key);
      if (cached) cacheHits++;
    }
    
    results.cacheHitRate = (cacheHits / testCalls) * 100;
    console.log(`   📊 Cache hit rate: ${results.cacheHitRate}% (${cacheHits}/${testCalls})`);
    console.log('');

    // ===== 8. TEST ENTITY CACHING & DATA =====
    console.log('8️⃣  Testing Entity Caching & Real Notion Data...');
    
    const entities = ['users', 'projects', 'teams', 'clients'];
    for (const entity of entities) {
      const cacheKey = `${entity}:list:pageSize=5`;
      
      // Clear cache
      await redisService.del(cacheKey);
      
      // Query each entity type
      const queryStart = Date.now();
      let data: any;
      
      switch (entity) {
        case 'users':
          data = await notionService.queryUsersDatabase(undefined, 5);
          break;
        case 'projects':
          data = await notionService.queryProjectsDatabase(undefined, undefined, 5);
          break;
        case 'teams':
          data = await notionService.queryTeamsDatabase(undefined, 5);
          break;
        case 'clients':
          data = await notionService.queryClientsDatabase(undefined, 5);
          break;
      }
      
      const queryTime = Date.now() - queryStart;
      console.log(`\n   📁 ${entity.toUpperCase()}: ${data?.results?.length || 0} items (${queryTime}ms)`);
      
      // Afficher un échantillon des données réelles
      if (data?.results?.length > 0) {
        const firstItem = data.results[0];
        console.log(`   └── Sample ${entity.slice(0, -1)}:`);
        console.log(`       ├── ID: ${firstItem.id}`);
        
        switch (entity) {
          case 'users':
            console.log(`       ├── Name: ${firstItem.name || 'N/A'}`);
            console.log(`       ├── Email: ${firstItem.email || 'N/A'}`);
            console.log(`       ├── Team: ${firstItem.team || 'N/A'}`);
            console.log(`       └── Tasks: ${firstItem.tasks?.length || 0} assigned`);
            break;
          case 'projects':
            console.log(`       ├── Name: ${firstItem.name || 'N/A'}`);
            console.log(`       ├── Status: ${firstItem.status || 'N/A'}`);
            console.log(`       ├── Client: ${firstItem.client || 'N/A'}`);
            console.log(`       └── Tasks: ${firstItem.tasks?.length || 0} tasks`);
            break;
          case 'teams':
            console.log(`       ├── Name: ${firstItem.name || 'N/A'}`);
            console.log(`       └── Members: ${firstItem.members?.length || 0} members`);
            break;
          case 'clients':
            console.log(`       ├── Name: ${firstItem.name || 'N/A'}`);
            console.log(`       └── Projects: ${firstItem.projects?.length || 0} projects`);
            break;
        }
      } else {
        console.log(`   └── No ${entity} found in database`);
      }
    }
    console.log('');

    // ===== 9. FINAL RESULTS =====
    results.totalTime = Date.now() - startTime;
    
    console.log('=' .repeat(60));
    console.log('\n📊 FINAL TEST RESULTS:\n');
    console.log(`✅ Redis Health: ${results.redisHealth ? 'Healthy' : 'Unhealthy'}`);
    console.log(`✅ Cache Hit Rate: ${results.cacheHitRate}%`);
    console.log(`✅ Calendar Performance: ${results.calendarPerformance.speedImprovement}% faster with cache`);
    console.log(`✅ Conflict Detection: ${results.conflictDetection ? 'Working' : 'Not Working'}`);
    console.log(`✅ Total Test Time: ${results.totalTime}ms`);
    
    // Overall status
    const allTestsPassed = 
      results.redisHealth && 
      results.cacheHitRate > 0 && 
      results.calendarPerformance.speedImprovement > 0 &&
      results.conflictDetection;
    
    console.log('\n' + '='.repeat(60));
    console.log(allTestsPassed ? 
      '🎉 ALL TESTS PASSED! Integration is working correctly.' : 
      '⚠️  Some tests failed. Check the results above.'
    );
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    logger.error('Integration test failed', error);
  } finally {
    // Cleanup test data
    await redisService.invalidatePattern('test:*');
    
    // Disconnect from MongoDB
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('📦 MongoDB disconnected');
    }
    
    process.exit(0);
  }
}

// Run the test
console.log('Starting integration test...');
testCompleteIntegration().catch(console.error);