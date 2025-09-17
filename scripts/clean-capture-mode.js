#!/usr/bin/env node

/**
 * Script to clean capture mode and remove old captured events
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/matter-traffic';

async function cleanCaptureMode() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('notionconfigs');

    // Find the active config
    const config = await collection.findOne({ environment: 'development' });
    
    if (!config) {
      console.log('❌ No configuration found');
      return;
    }

    console.log('📋 Current capture mode status:');
    console.log('  - Enabled:', config.webhookCaptureMode?.enabled || false);
    console.log('  - Captured event:', !!config.webhookCaptureMode?.capturedEvent);
    
    if (config.webhookCaptureMode?.capturedEvent) {
      console.log('  - Event type:', config.webhookCaptureMode.capturedEvent.type || 'undefined');
      console.log('  - Database ID:', config.webhookCaptureMode.capturedEvent.databaseId || 'undefined');
    }

    // Clean the capture mode
    const result = await collection.updateOne(
      { environment: 'development' },
      { 
        $set: { 
          'webhookCaptureMode.enabled': false,
          'webhookCaptureMode.enabledAt': new Date()
        },
        $unset: { 
          'webhookCaptureMode.capturedEvent': '' 
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log('✅ Capture mode cleaned successfully');
      console.log('  - Capture mode disabled');
      console.log('  - Old captured event removed');
    } else {
      console.log('ℹ️ No changes made');
    }

    // Verify the changes
    const updatedConfig = await collection.findOne({ environment: 'development' });
    console.log('\n📋 New capture mode status:');
    console.log('  - Enabled:', updatedConfig.webhookCaptureMode?.enabled || false);
    console.log('  - Captured event:', !!updatedConfig.webhookCaptureMode?.capturedEvent);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the script
cleanCaptureMode().catch(console.error);