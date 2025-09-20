#!/usr/bin/env node

/**
 * Azure-ready webhook token capture script for Notion webhook setup
 * 
 * This script is designed to run on Azure App Service staging environment
 * to capture the verification token from Notion's initial webhook POST request
 * 
 * Deployment:
 * 1. Deploy this to Azure staging
 * 2. Run it temporarily on port 3001 (or configure via PORT env)
 * 3. Set the URL in Notion webhook configuration: https://your-staging.azurewebsites.net/api/v1/webhooks/notion/capture
 * 4. Notion will send the verification_token in the first POST
 * 5. Check Azure logs (Application Insights or Log Stream) to see the token
 * 6. Copy the token and paste it back in Notion UI
 * 7. Stop this script and let the main app handle webhooks
 */

import express from 'express';
import { json } from 'express';

const app = express();
app.use(json());

// Use Azure's PORT or fallback to 3001
const PORT = process.env.PORT || 3001;

// Store captured tokens in memory (will be visible in logs)
const capturedTokens: any[] = [];

// Main capture endpoint - matches our existing webhook route structure
app.post('/api/v1/webhooks/notion/capture', (req, res) => {
  // Log with clear separators for Azure Log Stream visibility
  console.log('\n' + '='.repeat(60));
  console.log('🎯 WEBHOOK TOKEN CAPTURE - AZURE STAGING');
  console.log('='.repeat(60));
  console.log('📅 Timestamp:', new Date().toISOString());
  
  // Log headers for debugging
  console.log('\n📋 HEADERS:');
  Object.entries(req.headers).forEach(([key, value]) => {
    if (key.toLowerCase().includes('notion') || 
        key.toLowerCase().includes('signature') || 
        key.toLowerCase().includes('content')) {
      console.log(`  ${key}: ${value}`);
    }
  });
  
  // Log the complete request body
  console.log('\n📦 REQUEST BODY:');
  console.log(JSON.stringify(req.body, null, 2));
  
  // Check for the verification token
  if (req.body.verification_token) {
    // Make it VERY visible in Azure logs
    console.log('\n' + '🎉'.repeat(30));
    console.log('✅ VERIFICATION TOKEN SUCCESSFULLY CAPTURED!');
    console.log('='.repeat(60));
    console.log('📝 TOKEN VALUE:');
    console.log(`    ${req.body.verification_token}`);
    console.log('='.repeat(60));
    console.log('👆 COPY THE TOKEN ABOVE AND PASTE IT IN NOTION UI');
    console.log('🎉'.repeat(30) + '\n');
    
    // Store the token with metadata
    capturedTokens.push({
      token: req.body.verification_token,
      timestamp: new Date().toISOString(),
      headers: req.headers,
      body: req.body
    });
    
    // Also log to Azure Application Insights if available
    if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
      console.log('📊 Token also logged to Application Insights');
    }
  } else {
    console.log('\n⚠️ No verification_token found in this request');
    console.log('   Notion should send it in the first POST request');
    console.log('   Make sure you\'re using the correct webhook URL in Notion');
  }
  
  // Always respond 200 OK to Notion
  res.status(200).json({ 
    received: true,
    timestamp: new Date().toISOString(),
    hasToken: !!req.body.verification_token,
    environment: 'azure-staging'
  });
});

// Status endpoint to check captured tokens via browser
app.get('/api/v1/webhooks/notion/capture/status', (req, res) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Webhook Token Capture Status - Azure Staging</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .token { background: #e8f5e9; padding: 15px; border-radius: 4px; margin: 10px 0; }
        .token-value { font-family: monospace; font-size: 16px; color: #2e7d32; font-weight: bold; }
        .no-tokens { color: #666; padding: 20px; text-align: center; }
        h1 { color: #333; }
        .timestamp { color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 Webhook Token Capture - Azure Staging</h1>
        <p>Environment: ${process.env.WEBSITE_SITE_NAME || 'local'}</p>
        <p>Status: Active and listening for Notion webhooks</p>
        
        <h2>📝 Captured Tokens (${capturedTokens.length})</h2>
        ${capturedTokens.length > 0 ? 
          capturedTokens.map(t => `
            <div class="token">
                <div class="timestamp">Captured at: ${t.timestamp}</div>
                <div class="token-value">${t.token}</div>
            </div>
          `).join('') :
          '<div class="no-tokens">No tokens captured yet. Configure Notion webhook to send to this URL.</div>'
        }
        
        <h2>📋 Instructions</h2>
        <ol>
            <li>In Notion webhook settings, set the URL to: <br>
                <code>https://${req.get('host')}/api/v1/webhooks/notion/capture</code>
            </li>
            <li>Notion will send a POST request with the verification_token</li>
            <li>Refresh this page to see captured tokens</li>
            <li>Copy the token and paste it back in Notion UI</li>
            <li>Once verified, update your webhook URL to remove '/capture' suffix</li>
        </ol>
    </div>
</body>
</html>
  `;
  
  res.set('Content-Type', 'text/html');
  res.send(html);
});

// Health check endpoint for Azure
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'webhook-token-capture-azure',
    environment: process.env.WEBSITE_SITE_NAME || 'local',
    timestamp: new Date().toISOString(),
    capturedTokens: capturedTokens.length
  });
});

// Root endpoint with instructions
app.get('/', (req, res) => {
  res.json({
    service: 'Notion Webhook Token Capture for Azure',
    endpoints: {
      capture: '/api/v1/webhooks/notion/capture',
      status: '/api/v1/webhooks/notion/capture/status',
      health: '/health'
    },
    instructions: 'Visit /api/v1/webhooks/notion/capture/status for web interface'
  });
});

// Start the server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 WEBHOOK TOKEN CAPTURE SERVER - AZURE STAGING');
  console.log('='.repeat(60));
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Azure Site: ${process.env.WEBSITE_SITE_NAME || 'Not on Azure'}`);
  console.log(`📝 Webhook Capture URL: /api/v1/webhooks/notion/capture`);
  console.log(`📊 Status Page: /api/v1/webhooks/notion/capture/status`);
  console.log(`❤️  Health Check: /health`);
  console.log('='.repeat(60));
  console.log('\n⏳ Waiting for Notion webhook verification token...\n');
  
  // Log startup to Application Insights if configured
  if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    console.log('📊 Application Insights is configured - tokens will be logged there too');
  }
});

// Graceful shutdown for Azure
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});