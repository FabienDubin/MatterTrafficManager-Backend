import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { TaskModel } from '../models/Task.model';
import { ProjectModel } from '../models/Project.model';
import { MemberModel } from '../models/Member.model';
import { TeamModel } from '../models/Team.model';
import { ClientModel } from '../models/Client.model';
import { SyncLogModel } from '../models/SyncLog.model';
import { SyncSettingsModel } from '../models/SyncSettings.model';

dotenv.config();

/**
 * Script to create/update indexes for sync functionality
 */
async function createSyncIndexes() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/matter-traffic';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Create indexes for SyncLog
    console.log('\n📇 Creating indexes for SyncLog...');
    await SyncLogModel.createIndexes();
    console.log('✅ SyncLog indexes created');

    // Create indexes for SyncSettings
    console.log('\n📇 Creating indexes for SyncSettings...');
    await SyncSettingsModel.createIndexes();
    console.log('✅ SyncSettings indexes created');

    // Ensure TTL indexes on cached collections
    const collections = [
      { model: TaskModel, name: 'Task' },
      { model: ProjectModel, name: 'Project' },
      { model: MemberModel, name: 'Member' },
      { model: TeamModel, name: 'Team' },
      { model: ClientModel, name: 'Client' },
    ];

    for (const { model, name } of collections) {
      console.log(`\n📇 Checking TTL index for ${name}...`);
      
      // Check if _ttl field exists in schema
      const schemaHasTTL = (model as any).schema.path('_ttl');
      
      if (schemaHasTTL) {
        // Create TTL index if not exists
        await model.collection.createIndex(
          { _ttl: 1 },
          { expireAfterSeconds: 0 }
        );
        console.log(`✅ TTL index ensured for ${name}`);
      } else {
        console.log(`⚠️  ${name} model doesn't have _ttl field - skipping TTL index`);
      }

      // Create index on notionId for fast lookups
      await model.collection.createIndex({ notionId: 1 }, { unique: true });
      console.log(`✅ NotionId index ensured for ${name}`);

      // Create index on lastNotionSync for sync queries
      const schemaHasLastSync = (model as any).schema.path('lastNotionSync');
      if (schemaHasLastSync) {
        await model.collection.createIndex({ lastNotionSync: -1 });
        console.log(`✅ LastNotionSync index ensured for ${name}`);
      }
    }

    // Initialize default sync settings for each entity
    console.log('\n⚙️  Initializing default sync settings...');
    const entityTypes = ['Task', 'Project', 'Member', 'Team', 'Client'];
    
    for (const entityType of entityTypes) {
      const existingSettings = await SyncSettingsModel.findOne({ entityType });
      if (!existingSettings) {
        await SyncSettingsModel.create({ entityType });
        console.log(`✅ Created default settings for ${entityType}`);
      } else {
        console.log(`✔️  Settings already exist for ${entityType}`);
      }
    }

    console.log('\n✨ All sync indexes and settings created successfully!');
    
    // List all indexes for verification
    console.log('\n📊 Current indexes summary:');
    for (const { model, name } of collections) {
      const indexes = await model.collection.listIndexes().toArray();
      console.log(`\n${name}:`);
      indexes.forEach(index => {
        console.log(`  - ${JSON.stringify(index.key)}`);
      });
    }

  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  createSyncIndexes();
}