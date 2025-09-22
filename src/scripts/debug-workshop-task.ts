#!/usr/bin/env node
/**
 * Debug the Workshop IA task to check its status property
 */

import dotenv from 'dotenv';
import path from 'path';
import { notion, TASK_PROPERTY_IDS } from '../config/notion.config';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function debugWorkshopTask() {
  try {
    // Task ID from the URL
    const taskId = '268a12bfa99281bb8d1bc6c83cdcba1e';
    
    console.log('\n🔍 Fetching Workshop IA task from Notion...\n');
    console.log('Task ID:', taskId);
    
    // Get the page directly
    const page = await notion.pages.retrieve({
      page_id: taskId
    }) as any;
    
    const props = page.properties;
    
    console.log('\n📊 Status Property Analysis:');
    console.log('==============================\n');
    
    // Show the configured status property name
    console.log('Configured status property name:', TASK_PROPERTY_IDS.status);
    console.log('Looking for property:', `"${TASK_PROPERTY_IDS.status}"`);
    
    // Check if the property exists
    const statusProp = props[TASK_PROPERTY_IDS.status];
    
    if (statusProp) {
      console.log('\n✅ Status property found!');
      console.log('Raw property:', JSON.stringify(statusProp, null, 2));
      
      // Try different extraction methods
      if (statusProp.select?.name) {
        console.log('\nExtracted via select:', statusProp.select.name);
      }
      if (statusProp.status?.name) {
        console.log('Extracted via status:', statusProp.status.name);
      }
    } else {
      console.log('\n❌ Status property NOT found with key:', TASK_PROPERTY_IDS.status);
    }
    
    // Show all available properties
    console.log('\n📝 All properties in this task:');
    const propList = Object.keys(props).sort();
    propList.forEach(key => {
      const propType = Object.keys(props[key])[0];
      const isStatus = key.toLowerCase().includes('état') || 
                      key.toLowerCase().includes('status') || 
                      key.toLowerCase().includes('statut');
      console.log(`- "${key}": type=${propType}${isStatus ? ' <-- Possible status field?' : ''}`);
      
      // Show value for potential status fields
      if (isStatus && props[key] && propType) {
        const propObj = props[key] as any;
        const value = propObj[propType]?.name || propObj[propType];
        console.log(`    Value: ${JSON.stringify(value)}`);
      }
    });
    
    // Check if we're using the wrong property name
    console.log('\n🔎 Searching for status-like properties:');
    propList.forEach(key => {
      const prop = props[key];
      if (prop.select?.name || prop.status?.name) {
        const value = prop.select?.name || prop.status?.name;
        console.log(`- "${key}": "${value}" (type: ${Object.keys(prop)[0]})`);
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugWorkshopTask();