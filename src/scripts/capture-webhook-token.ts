#!/usr/bin/env node

/**
 * Simple webhook token capture script for Notion webhook setup
 * 
 * Usage:
 * 1. Deploy this to Azure or run locally with ngrok
 * 2. Set this URL in Notion webhook configuration
 * 3. Notion will send the verification_token
 * 4. Copy the token and paste it back in Notion UI
 */

import express from 'express';
import { json } from 'express';

const app = express();
app.use(json());

const PORT = process.env.PORT || 3001;

// Store captured tokens in memory
const capturedTokens: any[] = [];

// Main capture endpoint
app.post('/api/v1/webhooks/notion', (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 WEBHOOK RECEIVED AT:', new Date().toISOString());
  console.log('='.repeat(60));
  
  // Log headers
  console.log('\n📋 HEADERS:');
  Object.entries(req.headers).forEach(([key, value]) => {
    if (key.toLowerCase().includes('notion') || key.toLowerCase().includes('signature')) {
      console.log(`  ${key}: ${value}`);
    }
  });
  
  // Log body
  console.log('\n📦 BODY:');
  console.log(JSON.stringify(req.body, null, 2));
  
  // Check for verification token
  if (req.body.verification_token) {
    console.log('\n' + '🎉'.repeat(20));
    console.log('✅ VERIFICATION TOKEN FOUND!');
    console.log('📝 TOKEN:', req.body.verification_token);
    console.log('🎉'.repeat(20));
    console.log('\n👆 COPY THIS TOKEN AND PASTE IT IN NOTION UI\n');
    
    // Store the token
    capturedTokens.push({
      token: req.body.verification_token,
      timestamp: new Date().toISOString(),
      headers: req.headers,
      body: req.body
    });
  }
  
  // Always respond 200 OK
  res.status(200).json({ 
    received: true,
    timestamp: new Date().toISOString(),
    hasToken: !!req.body.verification_token
  });
});

// Status endpoint to check captured tokens
app.get('/api/v1/webhooks/notion/status', (req, res) => {
  res.json({
    capturedTokens: capturedTokens.length,
    tokens: capturedTokens.map(t => ({
      token: t.token,
      timestamp: t.timestamp
    }))
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'webhook-token-capture',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 WEBHOOK TOKEN CAPTURE SERVER STARTED');
  console.log('='.repeat(60));
  console.log(`📍 Port: ${PORT}`);
  console.log(`📝 Webhook URL: http://localhost:${PORT}/api/v1/webhooks/notion`);
  console.log(`📊 Status URL: http://localhost:${PORT}/api/v1/webhooks/notion/status`);
  console.log(`❤️  Health URL: http://localhost:${PORT}/health`);
  console.log('='.repeat(60));
  console.log('\n⏳ Waiting for Notion webhook...\n');
});