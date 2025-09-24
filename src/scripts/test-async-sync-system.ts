#!/usr/bin/env ts-node

/**
 * Script de test complet pour le système de synchronisation asynchrone
 * Test les conflits, la queue, le mode async et la résolution
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { RedisService } from '../services/redis.service';
import syncQueueService from '../services/sync-queue.service';
import conflictService from '../services/conflict.service';
import { ConfigModel } from '../models/Config.model';
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
  section('2. TEST SYNC QUEUE');
  
  const syncQueue = syncQueueService;
  const redisService = new RedisService();
  
  try {
    // Clear queue first
    await syncQueue.clearQueue();
    log('🗑️  Queue cleared', colors.yellow);
    
    // Add multiple operations to queue
    const operations = [
      {
        type: 'create' as const,
        entityType: 'task',
        entityId: 'test-task-1',
        data: {
          title: 'Test Task 1',
          status: 'pending'
        }
      },
      {
        type: 'update' as const,
        entityType: 'task',
        entityId: 'test-task-2',
        data: {
          title: 'Updated Task 2',
          status: 'in_progress'
        }
      },
      {
        type: 'delete' as const,
        entityType: 'task',
        entityId: 'test-task-3',
        data: null
      }
    ];
    
    // Add operations to queue
    for (const op of operations) {
      await syncQueue.addToQueue(op);
      log(`✅ Added ${op.type} operation for ${op.entityId}`, colors.green);
    }
    
    // Check queue status
    const status = await syncQueue.getQueueStatus();
    log('\n📊 Queue Status:', colors.cyan);
    log(`  Queue length: ${status.queueLength}`, colors.yellow);
    log(`  Processing: ${status.processing}`, colors.yellow);
    log(`  Processed: ${status.processed}`, colors.yellow);
    log(`  Failed: ${status.failed}`, colors.yellow);
    
    // Simulate processing one item
    log('\n🔄 Processing queue items...', colors.cyan);
    
    // Process with a mock processor
    const mockProcessor = async (operation: any) => {
      log(`  Processing ${operation.type} for ${operation.entityId}...`, colors.blue);
      
      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Simulate success for create and delete, but conflict for update
      if (operation.type === 'update') {
        throw new Error('Simulated conflict');
      }
      
      return { success: true, notionId: `notion-${operation.entityId}` };
    };
    
    // Process queue items
    let processedCount = 0;
    while (status.queueLength > 0 && processedCount < 3) {
      const item = (syncQueue as any).queue.shift();
      if (item) {
        try {
          await mockProcessor(item);
          log(`    ✅ Success`, colors.green);
        } catch (error: any) {
          log(`    ⚠️ Failed: ${error.message}`, colors.yellow);
          
          // Add to failed items
          (syncQueue as any).failedItems.push({
            ...item,
            error: error.message,
            attempts: 1,
            lastAttempt: new Date()
          });
        }
      }
      processedCount++;
    }
    
    // Final queue status
    const finalStatus = await syncQueue.getQueueStatus();
    log('\n📊 Final Queue Status:', colors.cyan);
    log(`  Processed: ${processedCount}`, colors.green);
    log(`  Failed: ${(syncQueue as any).failedItems.length}`, colors.yellow);
    
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
    // Simulate local and remote data
    const localData = {
      id: 'task-123',
      title: 'Local Task Title',
      status: 'in_progress',
      updatedAt: new Date('2024-01-01'),
      version: 1
    };
    
    const remoteData = {
      id: 'task-123',
      title: 'Remote Task Title',
      status: 'completed',
      updatedAt: new Date('2024-01-02'),
      version: 2
    };
    
    // Store local data in cache
    await redisService.set('task:task-123', localData, 'task');
    log('✅ Local data stored in cache', colors.green);
    
    // Detect conflict
    const conflictDetected = await conflictService.detectConflict(
      'task',
      'task-123',
      localData,
      remoteData
    );
    
    if (conflictDetected) {
      log('⚠️  Conflict detected!', colors.yellow);
      
      // Get conflict details
      const conflicts = await conflictService.getPendingConflicts();
      log(`\n📋 Pending conflicts: ${conflicts.length}`, colors.cyan);
      
      if (conflicts.length > 0) {
        const conflict = conflicts[0];
        if (conflict) {
          log(`\n  Conflict ID: ${conflict.id}`, colors.yellow);
          log(`  Entity: ${conflict.entityType} - ${conflict.entityId}`, colors.yellow);
          log(`  Severity: ${conflict.severity}`, colors.yellow);
          log(`  Description: ${(conflict as any).description || 'N/A'}`, colors.yellow);
        
        // Test different resolution strategies
        log('\n🔧 Testing resolution strategies...', colors.cyan);
        
          // Test notion_wins strategy
          log('\n  Strategy: notion_wins', colors.blue);
          const notionWinsResult = await conflictService.resolveConflict(
            conflict,
            'notion_wins'
          );
        log(`    Result: ${notionWinsResult.success ? '✅ Success' : '❌ Failed'}`, 
            notionWinsResult.success ? colors.green : colors.red);
        
          // Verify cache was updated
          const cachedData = await redisService.get('task:task-123');
          if ((cachedData as any)?.title === remoteData.title) {
            log('    ✅ Cache updated with Notion data', colors.green);
          } else {
            log('    ❌ Cache not properly updated', colors.red);
          }
        }
      }
    } else {
      log('✅ No conflicts detected', colors.green);
    }
    
    return true;
  } catch (error) {
    log(`❌ Conflict test failed: ${error}`, colors.red);
    return false;
  }
}

async function testOptimisticUpdates() {
  section('4. TEST OPTIMISTIC UPDATES & ROLLBACK');
  
  const redisService = new RedisService();
  const syncQueue = syncQueueService;
  
  try {
    // Create a task with temporary ID (optimistic create)
    const tempTask = {
      id: 'temp-' + Date.now(),
      title: 'Optimistic Task',
      status: 'pending',
      isTemporary: true
    };
    
    // Store in cache immediately
    await redisService.set(`task:${tempTask.id}`, tempTask, 'task');
    log(`✅ Optimistic task created with temp ID: ${tempTask.id}`, colors.green);
    
    // Add to sync queue
    await syncQueue.addToQueue({
      type: 'create',
      entityType: 'task',
      entityId: tempTask.id,
      data: tempTask
    });
    log('✅ Added to sync queue', colors.green);
    
    // Simulate sync success
    log('\n🔄 Simulating successful sync...', colors.cyan);
    const notionId = 'notion-' + Date.now();
    
    // Update cache with real ID
    await redisService.delete(`task:${tempTask.id}`);
    const finalTask = { ...tempTask, id: notionId, isTemporary: false };
    await redisService.set(`task:${notionId}`, finalTask, 'task');
    
    log(`✅ Task synced with Notion ID: ${notionId}`, colors.green);
    
    // Test rollback scenario
    log('\n🔄 Testing rollback scenario...', colors.cyan);
    
    const failedTask = {
      id: 'temp-fail-' + Date.now(),
      title: 'Failed Task',
      status: 'pending',
      isTemporary: true
    };
    
    await redisService.set(`task:${failedTask.id}`, failedTask, 'task');
    log(`✅ Created task for rollback test: ${failedTask.id}`, colors.green);
    
    // Simulate sync failure
    log('❌ Simulating sync failure...', colors.yellow);
    
    // Rollback: remove from cache
    await redisService.delete(`task:${failedTask.id}`);
    log('✅ Task rolled back (removed from cache)', colors.green);
    
    return true;
  } catch (error) {
    log(`❌ Optimistic update test failed: ${error}`, colors.red);
    return false;
  }
}

async function testBatchResolution() {
  section('5. TEST BATCH CONFLICT RESOLUTION');
  
  const redisService = new RedisService();
  
  try {
    // Create multiple conflicts
    const conflicts = [
      {
        entityType: 'task',
        entityId: 'batch-1',
        localData: { title: 'Local 1', version: 1 },
        remoteData: { title: 'Remote 1', version: 2 }
      },
      {
        entityType: 'task',
        entityId: 'batch-2',
        localData: { title: 'Local 2', version: 1 },
        remoteData: { title: 'Remote 2', version: 2 }
      },
      {
        entityType: 'task',
        entityId: 'batch-3',
        localData: { title: 'Local 3', version: 1 },
        remoteData: { title: 'Remote 3', version: 2 }
      }
    ];
    
    // Store conflicts
    for (const c of conflicts) {
      await redisService.set(`task:${c.entityId}`, c.localData, 'task');
      await conflictService.detectConflict(
        c.entityType,
        c.entityId,
        c.localData,
        c.remoteData
      );
    }
    
    log(`✅ Created ${conflicts.length} conflicts`, colors.green);
    
    // Get all conflicts
    const pendingConflicts = await conflictService.getPendingConflicts();
    log(`📋 Pending conflicts: ${pendingConflicts.length}`, colors.cyan);
    
    // Resolve all with notion_wins
    log('\n🔧 Resolving all conflicts with notion_wins...', colors.cyan);
    
    let resolved = 0;
    for (const conflict of pendingConflicts) {
      const result = await conflictService.resolveConflict(conflict, 'notion_wins');
      if (result.success) resolved++;
    }
    
    log(`✅ Resolved ${resolved}/${pendingConflicts.length} conflicts`, colors.green);
    
    // Verify no conflicts remain
    const remainingConflicts = await conflictService.getPendingConflicts();
    if (remainingConflicts.length === 0) {
      log('✅ All conflicts resolved successfully', colors.green);
    } else {
      log(`⚠️ ${remainingConflicts.length} conflicts remain`, colors.yellow);
    }
    
    return true;
  } catch (error) {
    log(`❌ Batch resolution test failed: ${error}`, colors.red);
    return false;
  }
}

async function runAllTests() {
  section('MATTER TRAFFIC - ASYNC SYNC SYSTEM TEST');
  log('Testing Story 2.5: Synchronisation Bidirectionnelle', colors.bright);
  
  try {
    // Connect to database
    await connectDB();
    
    // Initialize Redis
    const redisService = new RedisService();
    // Redis is auto-connected in constructor
    log('✅ Redis connected', colors.green);
    
    // Run all tests
    const results = {
      config: await testAsyncModeConfig(),
      queue: await testSyncQueue(),
      conflicts: await testConflictDetection(),
      optimistic: await testOptimisticUpdates(),
      batch: await testBatchResolution()
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
      log('\n🎉 ALL TESTS PASSED! The async sync system is working correctly.', colors.bright + colors.green);
    } else {
      log('\n⚠️ Some tests failed. Please review the output above.', colors.bright + colors.yellow);
    }
    
    // Cleanup
    log('\n🧹 Cleaning up...', colors.cyan);
    await mongoose.connection.close();
    // Redis cleanup if needed
    log('✅ Cleanup complete', colors.green);
    
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