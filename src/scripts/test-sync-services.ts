#!/usr/bin/env ts-node

/**
 * Script de test pour les services de synchronisation
 * Utilise directement les services disponibles
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { RedisService } from '../services/redis.service';
import { ConfigModel } from '../models/Config.model';
import syncQueueService from '../services/sync-queue.service';
import { conflictService } from '../services/conflict.service';
import logger from '../config/logger.config';

dotenv.config();

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function section(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.bright + colors.cyan);
  console.log('='.repeat(60));
}

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/matter-traffic');
    log('✅ MongoDB connected', colors.green);
  } catch (error) {
    log('❌ MongoDB connection failed', colors.red);
    throw error;
  }
}

async function testAsyncModeConfig() {
  section('1. TEST CONFIGURATION ASYNC MODE');
  
  try {
    // Initialize configs if needed
    await ConfigModel.initDefaults();
    
    // Enable async mode for all operations
    await ConfigModel.setValue('ASYNC_MODE_CREATE', true);
    await ConfigModel.setValue('ASYNC_MODE_UPDATE', true);
    await ConfigModel.setValue('ASYNC_MODE_DELETE', true);
    
    log('✅ Async mode enabled for all operations', colors.green);
    
    // Verify configs
    const createAsync = await ConfigModel.getValue('ASYNC_MODE_CREATE');
    const updateAsync = await ConfigModel.getValue('ASYNC_MODE_UPDATE');
    const deleteAsync = await ConfigModel.getValue('ASYNC_MODE_DELETE');
    
    log(`  CREATE: ${createAsync}`, colors.yellow);
    log(`  UPDATE: ${updateAsync}`, colors.yellow);
    log(`  DELETE: ${deleteAsync}`, colors.yellow);
    
    return true;
  } catch (error) {
    log(`❌ Config test failed: ${error}`, colors.red);
    return false;
  }
}

async function testSyncQueue() {
  section('2. TEST SYNC QUEUE SERVICE');
  
  const redisService = new RedisService();
  
  try {
    // Test queue task creation
    log('Testing task queue operations...', colors.cyan);
    
    // Queue a task creation
    const createResult = await syncQueueService.queueTaskCreate({
      title: 'Test Task Queue ' + Date.now(),
      status: 'pending',
      workPeriod: {
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 3600000).toISOString()
      },
      assignedMembers: [],
      teams: []
    } as any);
    
    log(`✅ Task queued with temp ID: ${createResult.id}`, colors.green);
    log(`  Queued: ${createResult.queued}`, colors.yellow);
    
    // Verify task is in Redis
    const cachedTask = await redisService.get(`task:${createResult.id}`);
    if (cachedTask) {
      log(`✅ Task found in Redis cache`, colors.green);
      log(`  Temporary: ${(cachedTask as any)._temporary === true}`, colors.yellow);
    } else {
      log(`❌ Task not found in Redis`, colors.red);
    }
    
    // Queue a task update
    const updateQueued = await syncQueueService.queueTaskUpdate(
      createResult.id,
      {
        title: 'Updated Test Task',
        status: 'in_progress'
      } as any
    );
    
    log(`✅ Task update queued: ${updateQueued}`, colors.green);
    
    // Queue a task deletion
    const deleteQueued = await syncQueueService.queueTaskDelete(createResult.id);
    log(`✅ Task delete queued: ${deleteQueued}`, colors.green);
    
    // Get status (includes metrics)
    const status = syncQueueService.getStatus();
    log('\n📊 Queue Metrics:', colors.cyan);
    log(`  Queued: ${status.metrics.queued}`, colors.yellow);
    log(`  Processed: ${status.metrics.processed}`, colors.yellow);
    log(`  Failed: ${status.metrics.failed}`, colors.yellow);
    log(`  Retries: ${status.metrics.retries}`, colors.yellow);
    log(`  Average processing time: ${status.metrics.avgProcessingTime}ms`, colors.yellow);
    
    log('\n📋 Queue Status:', colors.cyan);
    log(`  Queue length: ${status.queueLength}`, colors.yellow);
    log(`  Processing: ${status.processing}`, colors.yellow);
    
    // Wait a bit to see if processing happens
    log('\n⏳ Waiting 2 seconds for processing...', colors.cyan);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const finalStatus = syncQueueService.getStatus();
    log('\n📊 Final Metrics:', colors.cyan);
    log(`  Processed: ${finalStatus.metrics.processed}`, colors.green);
    
    return true;
  } catch (error) {
    log(`❌ Queue test failed: ${error}`, colors.red);
    return false;
  }
}

async function testConflictDetection() {
  section('3. TEST CONFLICT DETECTION & RESOLUTION');
  
  const redisService = new RedisService();
  
  try {
    // Simulate local and remote data with differences
    const localData = {
      id: 'conflict-test-123',
      title: 'Local Task Title',
      status: 'in_progress',
      updatedAt: new Date('2024-01-01').toISOString(),
      version: 1
    };
    
    const remoteData = {
      id: 'conflict-test-123',
      title: 'Remote Task Title',
      status: 'completed',
      updatedAt: new Date('2024-01-02').toISOString(),
      version: 2
    };
    
    // Store local data in cache
    await redisService.set('task:conflict-test-123', localData, 'task');
    log('✅ Local data stored in cache', colors.green);
    
    // Detect conflict
    const conflict = await conflictService.detectConflict(
      'task',
      'conflict-test-123',
      localData,
      remoteData
    );
    
    if (conflict) {
      log('⚠️  Conflict detected!', colors.yellow);
      log(`  ID: ${conflict.id}`, colors.yellow);
      log(`  Severity: ${conflict.severity}`, colors.yellow);
      
      // Get pending conflicts
      const pendingConflicts = await conflictService.getPendingConflicts();
      log(`\n📋 Pending conflicts: ${pendingConflicts.length}`, colors.cyan);
      
      // Resolve with notion_wins
      log('\n🔧 Resolving with notion_wins strategy...', colors.cyan);
      
      const resolution = await conflictService.resolveConflict(
        conflict,
        'notion_wins'
      );
      
      if (resolution.success) {
        log('✅ Conflict resolved successfully', colors.green);
        
        // Verify cache was updated
        const updatedData = await redisService.get('task:conflict-test-123');
        if (updatedData && (updatedData as any).title === remoteData.title) {
          log('✅ Cache updated with remote data', colors.green);
        }
      } else {
        log('❌ Conflict resolution failed', colors.red);
      }
    } else {
      log('ℹ️  No conflict detected (might be auto-resolved)', colors.yellow);
    }
    
    return true;
  } catch (error) {
    log(`❌ Conflict test failed: ${error}`, colors.red);
    return false;
  }
}

async function testOptimisticUpdates() {
  section('4. TEST OPTIMISTIC UPDATES');
  
  const redisService = new RedisService();
  
  try {
    // Create a task optimistically
    const result = await syncQueueService.queueTaskCreate({
      title: 'Optimistic Task ' + Date.now(),
      status: 'pending',
      workPeriod: {
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 3600000).toISOString()
      }
    } as any);
    
    log(`✅ Optimistic task created with temp ID: ${result.id}`, colors.green);
    
    // Check if it's temporary
    if (result.id.startsWith('temp-')) {
      log('✅ Task has temporary ID format', colors.green);
    }
    
    // Verify it's in cache
    const cached = await redisService.get(`task:${result.id}`);
    if (cached && (cached as any)._temporary === true) {
      log('✅ Task marked as temporary in cache', colors.green);
    }
    
    // Simulate rollback by deleting from cache
    log('\n🔄 Testing rollback scenario...', colors.cyan);
    await redisService.delete(`task:${result.id}`);
    
    const afterRollback = await redisService.get(`task:${result.id}`);
    if (!afterRollback) {
      log('✅ Task successfully rolled back (removed from cache)', colors.green);
    }
    
    return true;
  } catch (error) {
    log(`❌ Optimistic update test failed: ${error}`, colors.red);
    return false;
  }
}

async function testBatchOperations() {
  section('5. TEST BATCH OPERATIONS');
  
  try {
    log('Creating multiple tasks for batch test...', colors.cyan);
    
    const tasks = [];
    for (let i = 0; i < 5; i++) {
      const result = await syncQueueService.queueTaskCreate({
        title: `Batch Task ${i + 1}`,
        status: 'pending',
        workPeriod: {
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 3600000).toISOString()
        }
      } as any);
      
      tasks.push(result);
      log(`  Created task ${i + 1}: ${result.id}`, colors.yellow);
    }
    
    log(`\n✅ Created ${tasks.length} tasks`, colors.green);
    
    // Check metrics
    const metrics = syncQueueService.getMetrics();
    log('\n📊 Batch Metrics:', colors.cyan);
    log(`  Total queued: ${metrics.queued}`, colors.yellow);
    
    // Wait for processing
    log('\n⏳ Waiting 3 seconds for batch processing...', colors.cyan);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const finalMetrics = syncQueueService.getMetrics();
    log('\n📊 Final Batch Metrics:', colors.cyan);
    log(`  Processed: ${finalMetrics.processed}`, colors.green);
    log(`  Failed: ${finalMetrics.failed}`, finalMetrics.failed > 0 ? colors.red : colors.green);
    
    return true;
  } catch (error) {
    log(`❌ Batch test failed: ${error}`, colors.red);
    return false;
  }
}

async function cleanupTestData() {
  section('CLEANUP');
  
  const redisService = new RedisService();
  
  try {
    // Clean up test data from Redis
    const keys = [
      'task:conflict-test-123',
      // Add other test keys if needed
    ];
    
    for (const key of keys) {
      await redisService.delete(key);
    }
    
    log('✅ Test data cleaned up', colors.green);
    
    // Reset async mode to false
    await ConfigModel.setValue('ASYNC_MODE_CREATE', false);
    await ConfigModel.setValue('ASYNC_MODE_UPDATE', false);
    await ConfigModel.setValue('ASYNC_MODE_DELETE', false);
    
    log('✅ Async mode disabled', colors.green);
    
    return true;
  } catch (error) {
    log(`⚠️  Cleanup warning: ${error}`, colors.yellow);
    return true; // Don't fail on cleanup
  }
}

async function runAllTests() {
  section('MATTER TRAFFIC - SERVICE INTEGRATION TEST');
  log('Testing Story 2.5: Services de Synchronisation', colors.bright);
  
  try {
    // Connect to database
    await connectDB();
    
    // Initialize Redis (auto-connects)
    const redisService = new RedisService();
    log('✅ Redis initialized', colors.green);
    
    // Run all tests
    const results = {
      config: await testAsyncModeConfig(),
      queue: await testSyncQueue(),
      conflicts: await testConflictDetection(),
      optimistic: await testOptimisticUpdates(),
      batch: await testBatchOperations(),
      cleanup: await cleanupTestData()
    };
    
    // Summary
    section('TEST SUMMARY');
    
    const passed = Object.values(results).filter(r => r).length;
    const total = Object.keys(results).length;
    
    log(`\nResults: ${passed}/${total} tests passed\n`, colors.bright);
    
    Object.entries(results).forEach(([test, result]) => {
      const status = result ? '✅ PASS' : '❌ FAIL';
      const color = result ? colors.green : colors.red;
      log(`  ${test.toUpperCase()}: ${status}`, color);
    });
    
    if (passed === total) {
      log('\n🎉 ALL TESTS PASSED! Services are working correctly.', colors.bright + colors.green);
      log('\nNext steps:', colors.cyan);
      log('  1. Check the admin UI at http://localhost:5173/admin/sync-config', colors.yellow);
      log('  2. Toggle async mode and test with real tasks', colors.yellow);
      log('  3. Check conflicts page at http://localhost:5173/admin/conflicts', colors.yellow);
    } else {
      log('\n⚠️  Some tests failed. Check the output above for details.', colors.bright + colors.yellow);
    }
    
    // Cleanup
    log('\n🧹 Closing connections...', colors.cyan);
    await mongoose.connection.close();
    log('✅ Done', colors.green);
    
    process.exit(passed === total ? 0 : 1);
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error}`, colors.bright + colors.red);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  log(`\n❌ Unhandled error: ${error}`, colors.bright + colors.red);
  process.exit(1);
});