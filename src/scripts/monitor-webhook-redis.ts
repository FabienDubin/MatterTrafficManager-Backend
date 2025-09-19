#!/usr/bin/env ts-node
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import { SyncLogModel } from '../models/SyncLog.model';
import { redisService } from '../services/redis.service';
import { NotionConfigModel } from '../models/NotionConfig.model';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

async function monitorWebhookAndRedis() {
  try {
    console.clear();
    console.log(`${COLORS.cyan}${COLORS.bright}🔍 WEBHOOK & REDIS MONITOR${COLORS.reset}`);
    console.log(`${COLORS.cyan}${'='.repeat(50)}${COLORS.reset}\n`);

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/matter-traffic';
    await mongoose.connect(mongoUri);
    console.log(`${COLORS.green}✅ Connected to MongoDB${COLORS.reset}\n`);

    // Check webhook configuration
    const config = await NotionConfigModel.findOne({ isActive: true });
    const hasToken = !!config?.webhookVerificationToken;
    
    console.log(`${COLORS.yellow}📋 Configuration Status:${COLORS.reset}`);
    console.log(`   - Webhook Token: ${hasToken ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   - Server Port: ${process.env.PORT || 5005}`);
    console.log(`   - Webhook URL: http://localhost:${process.env.PORT || 5005}/api/webhooks/notion`);
    console.log('');

    console.log(`${COLORS.yellow}📝 Instructions:${COLORS.reset}`);
    console.log('   1. Make sure your server is running (npm run dev)');
    console.log('   2. Make sure ngrok is exposing port 5005');
    console.log('   3. Go to Notion and modify a task/project');
    console.log('   4. Watch this monitor for activity\n');

    console.log(`${COLORS.cyan}${'─'.repeat(50)}${COLORS.reset}`);
    console.log(`${COLORS.bright}⏰ Monitoring in real-time... (Ctrl+C to stop)${COLORS.reset}\n`);

    // Track last seen webhook
    let lastWebhookId: string | null = null;
    const lastWebhook = await SyncLogModel.findOne({ syncMethod: 'webhook' })
      .sort({ createdAt: -1 });
    if (lastWebhook) {
      lastWebhookId = lastWebhook.webhookEventId || null;
    }

    // Monitor loop
    setInterval(async () => {
      try {
        // Check for new webhooks
        const newWebhook = await SyncLogModel.findOne({ syncMethod: 'webhook' })
          .sort({ createdAt: -1 });
        
        if (newWebhook && newWebhook.webhookEventId !== lastWebhookId) {
          lastWebhookId = newWebhook.webhookEventId || null;
          
          console.log(`\n${COLORS.green}${COLORS.bright}🎯 NEW WEBHOOK RECEIVED!${COLORS.reset}`);
          console.log(`${COLORS.green}${'─'.repeat(50)}${COLORS.reset}`);
          console.log(`   📅 Time: ${new Date().toLocaleTimeString()}`);
          console.log(`   📦 Entity: ${COLORS.bright}${newWebhook.entityType}${COLORS.reset}`);
          console.log(`   🆔 Event ID: ${newWebhook.webhookEventId}`);
          console.log(`   📊 Database: ${newWebhook.databaseId}`);
          console.log(`   ✅ Status: ${newWebhook.syncStatus}`);
          console.log(`   ⏱️ Duration: ${newWebhook.duration}ms`);
          
          // Check Redis invalidation
          console.log(`\n   ${COLORS.yellow}🗄️ Redis Cache Status:${COLORS.reset}`);
          
          // Map entity type to cache patterns
          const patterns = getPatternsByEntity(newWebhook.entityType);
          
          for (const pattern of patterns) {
            const testKey = pattern.replace(':*', ':test');
            const cachedData = await redisService.get(testKey);
            console.log(`   - ${pattern}: ${cachedData ? '❌ Still cached' : '✅ Invalidated'}`);
          }
          
          console.log(`${COLORS.green}${'─'.repeat(50)}${COLORS.reset}\n`);
        }
        
        // Show heartbeat every 10 seconds
        if (Date.now() % 10000 < 1000) {
          process.stdout.write(`${COLORS.cyan}.${COLORS.reset}`);
        }
        
      } catch (error) {
        // Silent error handling to not clutter the monitor
      }
    }, 1000); // Check every second

    // Keep process alive
    process.on('SIGINT', async () => {
      console.log(`\n\n${COLORS.yellow}👋 Stopping monitor...${COLORS.reset}`);
      await mongoose.disconnect();
      process.exit(0);
    });

  } catch (error) {
    console.error(`${COLORS.red}❌ Error:${COLORS.reset}`, error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

function getPatternsByEntity(entityType: string): string[] {
  switch (entityType) {
    case 'Task':
      return ['tasks:*'];
    case 'Project':
      return ['projects:*', 'tasks:*']; // Projects affect tasks too
    case 'Member':
      return ['members:*'];
    case 'Team':
      return ['teams:*'];
    case 'Client':
      return ['clients:*'];
    default:
      return [];
  }
}

monitorWebhookAndRedis();