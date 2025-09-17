#!/usr/bin/env node

/**
 * Script to test webhook connectivity
 * Usage: node scripts/test-webhook.js <ngrok-url>
 */

const https = require('https');
const http = require('http');

const ngrokUrl = process.argv[2];
if (!ngrokUrl) {
  console.error('❌ Usage: node scripts/test-webhook.js <ngrok-url>');
  console.error('Example: node scripts/test-webhook.js https://recondite-pedro-unregardful.ngrok-free.app');
  process.exit(1);
}

// Test configurations
const tests = [
  {
    name: 'Test capture endpoint (for initial setup)',
    path: '/api/v1/webhooks/notion/capture',
    method: 'POST',
    body: {
      type: 'block.updated',
      data: {
        parent: {
          database_id: 'test-database-id'
        }
      }
    },
    headers: {
      'Content-Type': 'application/json',
      'x-notion-signature': 'sha256=test-signature'
    }
  },
  {
    name: 'Test main webhook endpoint',
    path: '/api/v1/webhooks/notion',
    method: 'POST',
    body: {
      type: 'block.updated',
      data: {
        parent: {
          database_id: 'test-database-id'
        }
      }
    },
    headers: {
      'Content-Type': 'application/json',
      'x-notion-signature': 'sha256=test-signature'
    }
  },
  {
    name: 'Test capture status',
    path: '/api/v1/webhooks/notion/capture/status',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }
];

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const fullUrl = new URL(url);
    
    const requestOptions = {
      hostname: fullUrl.hostname,
      port: fullUrl.port,
      path: fullUrl.pathname,
      method: options.method,
      headers: options.headers
    };

    console.log(`${colors.cyan}→ ${options.method} ${fullUrl.href}${colors.reset}`);
    
    const req = protocol.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function runTests() {
  console.log(`${colors.blue}🧪 Testing webhook endpoints on: ${ngrokUrl}${colors.reset}\n`);
  
  for (const test of tests) {
    console.log(`${colors.yellow}📋 ${test.name}${colors.reset}`);
    
    try {
      const response = await makeRequest(
        `${ngrokUrl}${test.path}`,
        {
          method: test.method,
          headers: test.headers
        },
        test.body
      );
      
      if (response.statusCode >= 200 && response.statusCode < 300) {
        console.log(`${colors.green}✅ Success (${response.statusCode})${colors.reset}`);
      } else {
        console.log(`${colors.red}❌ Failed (${response.statusCode})${colors.reset}`);
      }
      
      if (response.body) {
        try {
          const parsed = JSON.parse(response.body);
          console.log(`${colors.cyan}Response:${colors.reset}`, JSON.stringify(parsed, null, 2));
        } catch {
          console.log(`${colors.cyan}Response:${colors.reset}`, response.body);
        }
      }
      
      console.log('---\n');
    } catch (error) {
      console.log(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
      console.log('---\n');
    }
  }
  
  console.log(`\n${colors.blue}📝 Configuration pour Notion:${colors.reset}`);
  console.log(`${colors.green}URL pour la capture initiale:${colors.reset}`);
  console.log(`${ngrokUrl}/api/v1/webhooks/notion/capture`);
  console.log(`\n${colors.green}URL pour le webhook final (après avoir le token):${colors.reset}`);
  console.log(`${ngrokUrl}/api/v1/webhooks/notion`);
  console.log('\n⚠️  Assure-toi que le mode capture est activé dans l\'admin avant de configurer dans Notion!');
}

// Run tests
runTests().catch(console.error);