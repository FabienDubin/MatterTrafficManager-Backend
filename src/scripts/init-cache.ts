#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import { notionSyncService } from '../services/notionSync.service';
import { SyncSettingsModel } from '../models/SyncSettings.model';
// NotionMapping model import will be dynamic
import { syncPollingJob } from '../jobs/syncPollingJob';
import { reconciliationJob } from '../jobs/reconciliationJob';
import logger from '../config/logger.config';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * Initialize sync settings for all entity types
 */
async function initializeSyncSettings() {
  console.log('🔧 Initializing sync settings...');

  const defaultSettings = [
    {
      entityType: 'Task',
      enabled: true,
      pollingInterval: 300, // 5 minutes
      webhookEnabled: true,
      ttlSeconds: 3600, // 1 hour
      circuitBreakerThreshold: 5,
      priority: 1
    },
    {
      entityType: 'Project',
      enabled: true,
      pollingInterval: 3600, // 1 hour
      webhookEnabled: true,
      ttlSeconds: 86400, // 24 hours
      circuitBreakerThreshold: 5,
      priority: 2
    },
    {
      entityType: 'Member',
      enabled: true,
      pollingInterval: 86400, // 24 hours
      webhookEnabled: false,
      ttlSeconds: 604800, // 7 days
      circuitBreakerThreshold: 5,
      priority: 3
    },
    {
      entityType: 'Team',
      enabled: true,
      pollingInterval: 86400, // 24 hours
      webhookEnabled: false,
      ttlSeconds: 604800, // 7 days
      circuitBreakerThreshold: 5,
      priority: 4
    },
    {
      entityType: 'Client',
      enabled: true,
      pollingInterval: 86400, // 24 hours
      webhookEnabled: false,
      ttlSeconds: 2592000, // 30 days
      circuitBreakerThreshold: 5,
      priority: 5
    }
  ];

  for (const settings of defaultSettings) {
    await SyncSettingsModel.findOneAndUpdate(
      { entityType: settings.entityType },
      settings,
      { upsert: true, new: true }
    );
    console.log(`  ✅ ${settings.entityType} settings initialized`);
  }
}

/**
 * Initialize Notion database mappings
 */
async function initializeNotionMappings() {
  console.log('\n🔧 Initializing Notion mappings...');
  
  const { NotionMappingModel } = await import('../models/NotionMapping.model');

  const mappings = [
    {
      entityType: 'Task',
      notionDatabaseId: process.env.NOTION_DB_TRAFFIC,
      mongoCollection: 'tasks',
      isActive: true,
      fieldMappings: {
        title: 'Name',
        workPeriod: 'Work Period',
        assignedMembers: 'Assigned to',
        projectId: 'Project',
        taskType: 'Type',
        status: 'Status'
      }
    },
    {
      entityType: 'Project',
      notionDatabaseId: process.env.NOTION_DB_PROJECTS,
      mongoCollection: 'projects',
      isActive: true,
      fieldMappings: {
        title: 'Name',
        client: 'Client',
        status: 'Status'
      }
    },
    {
      entityType: 'Member',
      notionDatabaseId: process.env.NOTION_DB_USERS,
      mongoCollection: 'members',
      isActive: true,
      fieldMappings: {
        title: 'Name',
        email: 'Email',
        team: 'Team'
      }
    },
    {
      entityType: 'Team',
      notionDatabaseId: process.env.NOTION_DB_TEAMS,
      mongoCollection: 'teams',
      isActive: true,
      fieldMappings: {
        title: 'Name',
        members: 'Members'
      }
    },
    {
      entityType: 'Client',
      notionDatabaseId: process.env.NOTION_DB_CLIENTS,
      mongoCollection: 'clients',
      isActive: true,
      fieldMappings: {
        title: 'Name',
        projects: 'Projects'
      }
    }
  ];

  for (const mapping of mappings) {
    if (!mapping.notionDatabaseId) {
      console.log(`  ⚠️  Skipping ${mapping.entityType}: No database ID in environment`);
      continue;
    }

    await NotionMappingModel.findOneAndUpdate(
      { entityType: mapping.entityType },
      mapping,
      { upsert: true, new: true }
    );
    console.log(`  ✅ ${mapping.entityType} mapping initialized`);
  }
}

/**
 * Perform initial sync for all entity types
 */
async function performInitialSync() {
  console.log('\n🔄 Performing initial synchronization...');

  const entityTypes = ['Client', 'Team', 'Project', 'Member', 'Task'];
  
  for (const entityType of entityTypes) {
    try {
      console.log(`\n  Syncing ${entityType}...`);
      
      const settings = await SyncSettingsModel.findOne({ entityType });
      if (!(settings as any)?.enabled) {
        console.log(`    ⏸️  ${entityType} sync is disabled`);
        continue;
      }

      await notionSyncService.syncDatabase(entityType, 'initial');
      console.log(`    ✅ ${entityType} synced successfully`);
      
      // Add delay between syncs to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`    ❌ ${entityType} sync failed:`, error);
    }
  }
}

/**
 * Initialize polling jobs
 */
async function initializeJobs() {
  console.log('\n🕐 Initializing background jobs...');

  try {
    // Initialize polling jobs
    await syncPollingJob.initialize();
    console.log('  ✅ Polling jobs initialized');

    // Initialize reconciliation job
    reconciliationJob.initialize();
    console.log('  ✅ Reconciliation job initialized');
  } catch (error) {
    console.error('  ❌ Failed to initialize jobs:', error);
  }
}

/**
 * Verify cache initialization
 */
async function verifyCacheInitialization() {
  console.log('\n🔍 Verifying cache initialization...');

  const { TaskModel } = await import('../models/Task.model');
  const { ProjectModel } = await import('../models/Project.model');
  const { MemberModel } = await import('../models/Member.model');
  const { TeamModel } = await import('../models/Team.model');
  const { ClientModel } = await import('../models/Client.model');

  const counts = await Promise.all([
    TaskModel.countDocuments({ lastSyncedAt: { $exists: true } }),
    ProjectModel.countDocuments({ lastSyncedAt: { $exists: true } }),
    MemberModel.countDocuments({ lastSyncedAt: { $exists: true } }),
    TeamModel.countDocuments({ lastSyncedAt: { $exists: true } }),
    ClientModel.countDocuments({ lastSyncedAt: { $exists: true } })
  ]);

  console.log('\n📊 Cache Statistics:');
  console.log(`  Tasks:    ${counts[0]} cached`);
  console.log(`  Projects: ${counts[1]} cached`);
  console.log(`  Members:  ${counts[2]} cached`);
  console.log(`  Teams:    ${counts[3]} cached`);
  console.log(`  Clients:  ${counts[4]} cached`);
  console.log(`  Total:    ${counts.reduce((a, b) => a + b, 0)} entities cached`);
}

/**
 * Main initialization function
 */
async function initializeCache() {
  console.log('🚀 Matter Traffic Cache Initialization\n');
  console.log('=====================================\n');

  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27018/matter-traffic?authSource=admin';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Initialize settings
    await initializeSyncSettings();
    
    // Initialize mappings
    await initializeNotionMappings();
    
    // Ask for user confirmation before initial sync
    if (process.argv.includes('--sync')) {
      await performInitialSync();
    } else {
      console.log('\n💡 Tip: Use --sync flag to perform initial synchronization');
    }
    
    // Initialize jobs if requested
    if (process.argv.includes('--jobs')) {
      await initializeJobs();
      console.log('\n⚠️  Jobs are running. Press Ctrl+C to stop...');
      
      // Keep process alive
      process.on('SIGINT', async () => {
        console.log('\n\n🛑 Stopping jobs...');
        syncPollingJob.stopAll();
        reconciliationJob.stop();
        await mongoose.connection.close();
        process.exit(0);
      });
      
      // Prevent process from exiting
      await new Promise(() => {});
    } else {
      console.log('\n💡 Tip: Use --jobs flag to start background jobs');
    }
    
    // Verify initialization
    await verifyCacheInitialization();
    
    console.log('\n=====================================');
    console.log('✅ Cache initialization complete!\n');
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  } finally {
    if (!process.argv.includes('--jobs')) {
      await mongoose.connection.close();
    }
  }
}

// Run initialization
initializeCache().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});