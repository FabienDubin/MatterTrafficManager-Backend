#!/usr/bin/env ts-node
/**
 * Test script for memory monitoring functionality
 */

import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { memoryMonitorService } from '../services/memory-monitor.service';

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const API_BASE = process.env.API_BASE_URL || 'http://localhost:5005/api/v1';

async function testMemoryMonitoring() {
  console.log('\n🔍 Testing Memory Monitoring System...\n');

  // Debug: Check if env vars are loaded
  console.log('📋 Environment Check:');
  console.log(
    `  • UPSTASH_REDIS_REST_URL: ${process.env.UPSTASH_REDIS_REST_URL ? '✅ Loaded' : '❌ Missing'}`
  );
  console.log(
    `  • UPSTASH_REDIS_REST_TOKEN: ${process.env.UPSTASH_REDIS_REST_TOKEN ? '✅ Loaded' : '❌ Missing'}`
  );
  console.log();

  try {
    // 1. Test direct service call
    console.log('1️⃣  Testing Memory Monitor Service directly...');
    const memoryInfo = await memoryMonitorService.getMemoryInfo();

    console.log('Memory Info:');
    console.log(`  • Used: ${memoryInfo.usedMemoryMB} MB`);
    console.log(`  • Limit: ${memoryInfo.maxMemoryMB} MB`);
    console.log(`  • Usage: ${memoryInfo.usagePercentage}%`);
    console.log(`  • Status: ${memoryInfo.warningLevel}`);
    console.log(`  • Key Count: ${memoryInfo.keyCount}`);
    if (memoryInfo.avgKeySize) {
      console.log(`  • Avg Key Size: ${memoryInfo.avgKeySize} bytes`);
    }
    console.log(`  • Eviction Policy: ${memoryInfo.evictionPolicy || 'default'}`);

    // 2. Test /health/memory endpoint
    console.log('\n2️⃣  Testing /health/memory endpoint...');
    const memoryResponse = await axios.get(`${API_BASE}/health/memory`);

    if (memoryResponse.data.success) {
      const data = memoryResponse.data.data;
      console.log('Memory Endpoint Response:');
      console.log(`  • Used Memory: ${data.memory.usedMemoryMB} MB`);
      console.log(`  • Warning Level: ${data.memory.warningLevel}`);
      console.log('\n  Key Distribution:');
      Object.entries(data.distribution).forEach(([type, count]) => {
        console.log(`    - ${type}: ${count}`);
      });

      if (data.recommendations && data.recommendations.length > 0) {
        console.log('\n  📋 Recommendations:');
        data.recommendations.forEach((rec: string) => {
          console.log(`    • ${rec}`);
        });
      }
    }

    // 3. Test memory estimate
    console.log('\n3️⃣  Testing Memory Estimate...');
    const estimate = memoryMonitorService.getMemoryEstimate();
    console.log(`  • Estimated Size: ${estimate.estimatedSizeMB} MB`);
    console.log(`  • Warning Level: ${estimate.warningLevel}`);

    // 4. Test detailed stats
    console.log('\n4️⃣  Testing Detailed Stats...');
    const detailedStats = await memoryMonitorService.getDetailedStats();
    console.log('Detailed Statistics:');
    console.log(`  • Last Check: ${detailedStats.lastCheck}`);
    console.log(`  • Memory Usage: ${detailedStats.memory.usagePercentage}%`);

    // 5. Test metrics endpoint (with memory info)
    console.log('\n5️⃣  Testing /health/metrics endpoint...');
    const metricsResponse = await axios.get(`${API_BASE}/health/metrics`);

    if (metricsResponse.data.success) {
      const summary = metricsResponse.data.data.summary;
      console.log('Metrics Summary:');
      console.log(`  • Cache Hit Rate: ${summary.hitRateDisplay}`);
      console.log(`  • Memory Usage: ${summary.memoryUsage}`);
      console.log(`  • Memory Warning: ${summary.memoryWarning}`);

      const alerts = metricsResponse.data.data.alerts;
      if (alerts && alerts.length > 0) {
        console.log('\n  ⚠️  Alerts:');
        alerts.forEach((alert: string) => {
          console.log(`    • ${alert}`);
        });
      }
    }

    console.log('\n✅ Memory Monitoring Test Complete!');

    // Display summary
    console.log('\n📊 SUMMARY');
    console.log('='.repeat(50));
    const status =
      memoryInfo.warningLevel === 'ok' ? '🟢' : memoryInfo.warningLevel === 'warning' ? '🟡' : '🔴';
    console.log(`Status: ${status} ${memoryInfo.warningLevel.toUpperCase()}`);
    console.log(
      `Memory: ${memoryInfo.usedMemoryMB}/${memoryInfo.maxMemoryMB} MB (${memoryInfo.usagePercentage}%)`
    );

    if (memoryInfo.warningLevel !== 'ok') {
      console.log('\n⚠️  Action Required:');
      if (memoryInfo.warningLevel === 'critical') {
        console.log('  • Memory usage critical! Consider eviction or upgrade.');
        console.log('  • Run POST /health/memory/evict to force eviction');
      } else {
        console.log('  • Memory usage high, monitor closely');
      }
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response:', error.response?.data);
    }
    process.exit(1);
  }
}

// Run the test
testMemoryMonitoring().catch(console.error);
