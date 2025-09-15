#!/usr/bin/env node

const { Client } = require('@notionhq/client');
const readline = require('readline');
const { promisify } = require('util');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = promisify(rl.question).bind(rl);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Default database IDs
const defaultDatabases = {
  teams: '268a12bfa99281f886bbd9ffc36be65f',
  users: '268a12bfa99281bf9101ebacbae3e39a',
  clients: '268a12bfa99281fb8566e7917a7f8b8e7',
  projects: '268a12bfa9928105a95fde79cea0f6ff',
  traffic: '268a12bfa99281809af5f6a9d2fccbe3'
};

// Helper functions
const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset}  ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️${colors.reset}  ${msg}`),
  header: (msg) => console.log(`\n${colors.bright}${colors.blue}${msg}${colors.reset}`),
  divider: () => console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`)
};

// Function to mask token for display
const maskToken = (token) => {
  if (!token) return '';
  const visibleLength = 10;
  if (token.length <= visibleLength) return '*'.repeat(token.length);
  return token.substring(0, visibleLength) + '*'.repeat(token.length - visibleLength);
};

// Function to test a single database
async function testDatabase(notion, dbName, dbId) {
  log.info(`Testing ${dbName} database...`);
  
  try {
    // Query the database
    const response = await notion.databases.query({
      database_id: dbId,
      page_size: 1
    });
    
    const totalResults = response.results.length;
    log.success(`Base ${colors.bright}${dbName}${colors.reset} OK - ${colors.green}${totalResults}${colors.reset} entrée(s) trouvée(s)`);
    
    // Display FULL response object
    console.log(`\n${colors.cyan}━━━ RÉPONSE COMPLÈTE NOTION POUR ${dbName.toUpperCase()} ━━━${colors.reset}`);
    console.log(JSON.stringify(response, null, 2));
    console.log(`${colors.cyan}━━━ FIN RÉPONSE ${dbName.toUpperCase()} ━━━${colors.reset}\n`);
    
    return { success: true, count: totalResults, fullResponse: response };
  } catch (error) {
    log.error(`Erreur pour ${dbName}: ${error.message}`);
    console.log(`\n${colors.red}━━━ ERREUR COMPLÈTE POUR ${dbName.toUpperCase()} ━━━${colors.reset}`);
    console.log(JSON.stringify({
      message: error.message,
      code: error.code,
      status: error.status,
      body: error.body,
      stack: error.stack
    }, null, 2));
    console.log(`${colors.red}━━━ FIN ERREUR ${dbName.toUpperCase()} ━━━${colors.reset}\n`);
    return { success: false, error: error.message };
  }
}

// Main function
async function main() {
  log.divider();
  log.header('🚀 Validation de connexion Notion - Mode Interactif');
  log.divider();
  
  try {
    // Step 1: Get Notion token
    log.header('Étape 1: Token Notion');
    console.log('Entrez votre token d\'intégration Notion');
    console.log('(Le token sera masqué après validation)');
    
    const token = await question('Token Notion: ');
    
    if (!token || token.trim() === '') {
      log.error('Token requis. Abandon.');
      process.exit(1);
    }
    
    log.success(`Token reçu: ${maskToken(token)}`);
    
    // Step 2: Get database IDs
    log.header('Étape 2: IDs des bases de données');
    console.log('Entrez les IDs des 5 bases (ou appuyez sur Entrée pour utiliser les valeurs par défaut)');
    
    const databases = {};
    
    for (const [name, defaultId] of Object.entries(defaultDatabases)) {
      const input = await question(`ID pour ${colors.bright}${name}${colors.reset} [${colors.cyan}${defaultId}${colors.reset}]: `);
      databases[name] = input.trim() || defaultId;
      log.info(`${name}: ${databases[name]}`);
    }
    
    // Step 3: Initialize Notion client
    log.header('Étape 3: Initialisation du client Notion');
    const notion = new Client({
      auth: token.trim()
    });
    log.success('Client Notion initialisé');
    
    // Step 4: Test each database
    log.header('Étape 4: Test des connexions');
    const results = {};
    
    for (const [name, id] of Object.entries(databases)) {
      results[name] = await testDatabase(notion, name, id);
      console.log(); // Empty line between tests
    }
    
    // Step 5: Final report
    log.divider();
    log.header('📊 Rapport Final');
    log.divider();
    
    let successCount = 0;
    let failureCount = 0;
    let totalEntries = 0;
    
    for (const [name, result] of Object.entries(results)) {
      if (result.success) {
        successCount++;
        totalEntries += result.count;
        log.success(`${name}: OK (${result.count} entrées)`);
      } else {
        failureCount++;
        log.error(`${name}: ÉCHEC - ${result.error}`);
      }
    }
    
    console.log();
    log.divider();
    console.log(`${colors.bright}Résumé:${colors.reset}`);
    console.log(`  Bases testées: ${Object.keys(results).length}`);
    console.log(`  ${colors.green}Succès: ${successCount}${colors.reset}`);
    console.log(`  ${colors.red}Échecs: ${failureCount}${colors.reset}`);
    console.log(`  Total entrées trouvées: ${totalEntries}`);
    
    if (successCount === Object.keys(results).length) {
      log.success('Toutes les bases sont accessibles !');
    } else if (successCount > 0) {
      log.warning('Certaines bases ne sont pas accessibles.');
    } else {
      log.error('Aucune base n\'est accessible. Vérifiez votre token et les IDs.');
    }
    
    log.divider();
    
  } catch (error) {
    log.error(`Erreur inattendue: ${error.message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  log.error(`Erreur non gérée: ${error.message}`);
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main().catch(error => {
    log.error(`Erreur fatale: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { testDatabase, main };