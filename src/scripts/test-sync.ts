#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import { notionSyncService } from '../services/notionSync.service';
import notionMappingService from '../services/notionMapping.service';
import notionService from '../services/notion.service';
import { SyncLogModel } from '../models/SyncLog.model';
import logger from '../config/logger.config';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * Test Notion connection and basic operations
 */
async function testNotionConnection() {
  console.log('🧪 Testing Notion connection...');
  
  try {
    const connected = await notionService.testConnection();
    if (connected) {
      console.log('✅ Notion connection successful');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Notion connection failed:', error);
    return false;
  }
}

/**
 * Test fetching data from Notion
 */
async function testNotionFetch() {
  console.log('\n🧪 Testing Notion data fetch...');
  
  try {
    const tasks = await notionService.queryTrafficDatabase(undefined, 5);
    console.log(`✅ Fetched ${tasks.results.length} tasks from Notion`);
    
    if (tasks.results.length > 0) {
      const firstTask = tasks.results[0];
      console.log('Sample task:', {
        id: firstTask?.id,
        title: firstTask?.title,
        status: firstTask?.status
      });
    }
    
    return true;
  } catch (error) {
    console.error('❌ Failed to fetch Notion data:', error);
    return false;
  }
}

/**
 * Test MongoDB connection
 */
async function testMongoConnection() {
  console.log('\n🧪 Testing MongoDB connection...');
  
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('✅ MongoDB already connected');
      return true;
    }

    const mongoUri = process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27018/matter-traffic?authSource=admin';
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connection successful');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    return false;
  }
}

/**
 * Test mapping a single task
 */
async function testTaskMapping() {
  console.log('\n🧪 Testing task mapping...');
  
  try {
    // Get a task from Notion
    const tasks = await notionService.queryTrafficDatabase(undefined, 1);
    
    if (tasks.results.length === 0) {
      console.log('⚠️  No tasks found in Notion to test mapping');
      return false;
    }

    const firstTask = tasks.results[0];
    if (!firstTask) {
      console.log('⚠️  No tasks found in Notion to test mapping');
      return false;
    }
    
    const taskId = firstTask.id;
    console.log(`Mapping task ${taskId}...`);
    
    const result = await notionMappingService.mapTaskToMongoDB(taskId);
    
    if (result.success) {
      console.log('✅ Task mapped successfully:', {
        mongoId: result.entity?._id,
        title: result.entity?.title
      });
      return true;
    } else {
      console.error('❌ Task mapping failed:', result.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Task mapping error:', error);
    return false;
  }
}

/**
 * Test sync service
 */
async function testSyncService() {
  console.log('\n🧪 Testing sync service...');
  
  try {
    // Sync a small batch of tasks
    console.log('Starting sync for Tasks (limit: 5)...');
    
    await notionSyncService.syncDatabase('Task', 'manual');
    
    // Check sync logs
    const recentLog = await SyncLogModel.findOne({ entityType: 'Task' })
      .sort({ startTime: -1 });
    
    if (recentLog) {
      console.log('✅ Sync completed:', {
        status: recentLog.syncStatus,
        itemsProcessed: recentLog.itemsProcessed,
        itemsFailed: recentLog.itemsFailed,
        duration: `${recentLog.duration}ms`
      });
      return recentLog.syncStatus !== 'failed';
    }
    
    return false;
  } catch (error) {
    console.error('❌ Sync service error:', error);
    return false;
  }
}

/**
 * Test circuit breaker
 */
async function testCircuitBreaker() {
  console.log('\n🧪 Testing circuit breaker...');
  
  try {
    const { SyncSettingsModel } = await import('../models/SyncSettings.model');
    
    // Get settings for Task
    const settings = await SyncSettingsModel.findOne({ entityType: 'Task' });
    
    if (settings) {
      console.log('Circuit breaker status:', {
        isOpen: settings.circuitBreaker?.isOpen || false,
        failureCount: settings.circuitBreaker?.failureCount || 0,
        threshold: (settings as any).circuitBreakerThreshold
      });
      
      // Test trip and reset
      await SyncSettingsModel.tripCircuitBreaker('Task');
      console.log('✅ Circuit breaker tripped');
      
      await SyncSettingsModel.resetCircuitBreaker('Task');
      console.log('✅ Circuit breaker reset');
      
      return true;
    }
    
    console.log('⚠️  No sync settings found for Task');
    return false;
  } catch (error) {
    console.error('❌ Circuit breaker test error:', error);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting Matter Traffic sync tests\n');
  console.log('=====================================\n');
  
  const results: Record<string, boolean> = {};
  
  // Run tests
  results['Notion Connection'] = await testNotionConnection() || false;
  results['MongoDB Connection'] = await testMongoConnection() || false;
  
  if (results['Notion Connection'] && results['MongoDB Connection']) {
    results['Notion Fetch'] = await testNotionFetch();
    results['Task Mapping'] = await testTaskMapping();
    results['Sync Service'] = await testSyncService();
    results['Circuit Breaker'] = await testCircuitBreaker();
  }
  
  // Print summary
  console.log('\n=====================================');
  console.log('📊 Test Summary:\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const [test, result] of Object.entries(results)) {
    console.log(`  ${result ? '✅' : '❌'} ${test}`);
    if (result) passed++;
    else failed++;
  }
  
  console.log(`\n📈 Results: ${passed} passed, ${failed} failed`);
  
  // Cleanup
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('\n🧹 MongoDB connection closed');
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

// Run tests
runTests().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});