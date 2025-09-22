#!/usr/bin/env node
/**
 * Debug script to check task status values from Notion
 */

import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const API_URL = process.env.API_URL || 'http://localhost:5005';

async function debugTaskStatus() {
  try {
    // Login
    const loginResponse = await axios.post(`${API_URL}/api/v1/auth/login`, {
      email: 'admin@matter.com',
      password: 'admin123!',
    });
    const token = loginResponse.data.data.accessToken;

    // Get tasks
    const today = new Date();
    const response = await axios.get(`${API_URL}/api/v1/tasks/calendar`, {
      params: {
        startDate: today.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0],
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const tasks = response.data.data.tasks;
    
    console.log('\n📊 Task Status Values:');
    console.log('======================\n');
    
    // Show unique status values
    const statuses = new Set(tasks.map((t: any) => t.status));
    console.log('Unique statuses found:', Array.from(statuses));
    
    // Show sample tasks with their status
    console.log('\nSample tasks:');
    tasks.slice(0, 3).forEach((task: any) => {
      console.log(`- "${task.title}": status = "${task.status}"`);
    });
    
    // Check if status is null or has specific values
    const nullStatuses = tasks.filter((t: any) => t.status === null).length;
    const undefinedStatuses = tasks.filter((t: any) => t.status === undefined).length;
    const emptyStatuses = tasks.filter((t: any) => t.status === '').length;
    
    console.log('\nStatus distribution:');
    console.log(`- null: ${nullStatuses}`);
    console.log(`- undefined: ${undefinedStatuses}`);
    console.log(`- empty string: ${emptyStatuses}`);
    console.log(`- total tasks: ${tasks.length}`);
    
  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
  }
}

debugTaskStatus();