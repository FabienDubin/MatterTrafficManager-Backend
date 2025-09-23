#!/usr/bin/env npx ts-node

/**
 * Script de test pour comparer les performances SYNC vs ASYNC
 * 
 * Usage: npx ts-node src/scripts/test-sync-vs-async.ts <token>
 */

import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:5005/api/v1';
const token = process.argv[2];

if (!token) {
  console.error('❌ Token requis: npx ts-node src/scripts/test-sync-vs-async.ts <token>');
  process.exit(1);
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

async function testPerformance() {
  console.log(`${colors.cyan}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║     TEST SYNC vs ASYNC PERFORMANCE     ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════╝${colors.reset}`);
  console.log();

  const taskData = {
    title: `Test Performance - ${new Date().toLocaleString()}`,
    workPeriod: {
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0]
    },
    status: 'not_started'
  };

  const results = {
    sync: { create: 0, update: 0, total: 0 },
    async: { create: 0, update: 0, total: 0 }
  };

  try {
    // ============== TEST 1: CREATE SYNC ==============
    console.log(`${colors.magenta}━━━ TEST 1: CREATE en mode SYNC ━━━${colors.reset}`);
    console.log(`${colors.yellow}Appel direct à Notion (attente...)${colors.reset}`);
    
    const syncStartCreate = Date.now();
    const syncCreateResponse = await api.post('/tasks', taskData);
    results.sync.create = Date.now() - syncStartCreate;
    
    const syncTaskId = syncCreateResponse.data.data.id;
    const syncMeta = syncCreateResponse.data.meta;
    
    console.log(`${colors.green}✓${colors.reset} Tâche créée: ${syncTaskId}`);
    console.log(`${colors.blue}ℹ${colors.reset} Temps total: ${colors.yellow}${results.sync.create}ms${colors.reset}`);
    console.log(`${colors.blue}ℹ${colors.reset} Temps Notion: ${syncMeta.notionTime || 'N/A'}`);
    console.log();

    // ============== TEST 2: UPDATE SYNC ==============
    console.log(`${colors.magenta}━━━ TEST 2: UPDATE en mode SYNC ━━━${colors.reset}`);
    
    const syncStartUpdate = Date.now();
    await api.put(`/tasks/${syncTaskId}`, { status: 'in_progress' });
    results.sync.update = Date.now() - syncStartUpdate;
    
    console.log(`${colors.green}✓${colors.reset} Tâche mise à jour`);
    console.log(`${colors.blue}ℹ${colors.reset} Temps: ${colors.yellow}${results.sync.update}ms${colors.reset}`);
    console.log();

    results.sync.total = results.sync.create + results.sync.update;

    // Attendre un peu avant les tests async
    await new Promise(resolve => setTimeout(resolve, 1000));

    // ============== TEST 3: CREATE ASYNC ==============
    console.log(`${colors.magenta}━━━ TEST 3: CREATE en mode ASYNC ━━━${colors.reset}`);
    console.log(`${colors.yellow}Queue + Redis (réponse immédiate)${colors.reset}`);
    
    const asyncStartCreate = Date.now();
    const asyncCreateResponse = await api.post('/tasks?async=true', {
      ...taskData,
      title: `${taskData.title} - ASYNC`
    });
    results.async.create = Date.now() - asyncStartCreate;
    
    const asyncTaskId = asyncCreateResponse.data.data.id;
    const asyncMeta = asyncCreateResponse.data.meta;
    
    console.log(`${colors.green}✓${colors.reset} Tâche créée (temp): ${asyncTaskId}`);
    console.log(`${colors.blue}ℹ${colors.reset} Temps total: ${colors.green}${results.async.create}ms${colors.reset}`);
    console.log(`${colors.blue}ℹ${colors.reset} Temps Queue: ${asyncMeta.queueTime || 'N/A'}`);
    console.log(`${colors.blue}ℹ${colors.reset} Sync status: ${asyncMeta.syncStatus}`);
    console.log();

    // ============== TEST 4: UPDATE ASYNC ==============
    console.log(`${colors.magenta}━━━ TEST 4: UPDATE en mode ASYNC ━━━${colors.reset}`);
    
    const asyncStartUpdate = Date.now();
    await api.put(`/tasks/${asyncTaskId}?async=true`, { status: 'in_progress' });
    results.async.update = Date.now() - asyncStartUpdate;
    
    console.log(`${colors.green}✓${colors.reset} Tâche mise à jour`);
    console.log(`${colors.blue}ℹ${colors.reset} Temps: ${colors.green}${results.async.update}ms${colors.reset}`);
    console.log();

    results.async.total = results.async.create + results.async.update;

    // ============== RÉSULTATS ==============
    console.log(`${colors.cyan}╔════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║             COMPARAISON                ║${colors.reset}`);
    console.log(`${colors.cyan}╚════════════════════════════════════════╝${colors.reset}`);
    console.log();

    const speedupCreate = Math.round(results.sync.create / results.async.create);
    const speedupUpdate = Math.round(results.sync.update / results.async.update);
    const speedupTotal = Math.round(results.sync.total / results.async.total);

    console.log(`${colors.yellow}📊 CREATE:${colors.reset}`);
    console.log(`   SYNC:  ${colors.red}${results.sync.create}ms${colors.reset}`);
    console.log(`   ASYNC: ${colors.green}${results.async.create}ms${colors.reset} (${speedupCreate}x plus rapide)`);
    console.log();

    console.log(`${colors.yellow}📊 UPDATE:${colors.reset}`);
    console.log(`   SYNC:  ${colors.red}${results.sync.update}ms${colors.reset}`);
    console.log(`   ASYNC: ${colors.green}${results.async.update}ms${colors.reset} (${speedupUpdate}x plus rapide)`);
    console.log();

    console.log(`${colors.yellow}📊 TOTAL:${colors.reset}`);
    console.log(`   SYNC:  ${colors.red}${results.sync.total}ms${colors.reset}`);
    console.log(`   ASYNC: ${colors.green}${results.async.total}ms${colors.reset} (${speedupTotal}x plus rapide)`);
    console.log();

    const avgImprovement = Math.round((results.sync.total - results.async.total) / results.sync.total * 100);
    console.log(`${colors.green}🚀 Amélioration moyenne: ${avgImprovement}% plus rapide${colors.reset}`);
    console.log();

    // ============== CLEANUP ==============
    console.log(`${colors.magenta}━━━ CLEANUP ━━━${colors.reset}`);
    
    // Archiver les tâches de test
    await api.delete(`/tasks/${syncTaskId}`);
    console.log(`${colors.green}✓${colors.reset} Tâche SYNC archivée`);
    
    // Pour la tâche async, attendre que la sync soit finie
    console.log(`${colors.yellow}⏳${colors.reset} Attente de la sync Notion pour la tâche ASYNC...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Essayer d'archiver (peut échouer si l'ID temp n'est pas encore remplacé)
    try {
      await api.delete(`/tasks/${asyncTaskId}`);
      console.log(`${colors.green}✓${colors.reset} Tâche ASYNC archivée`);
    } catch (e) {
      console.log(`${colors.yellow}ℹ${colors.reset} Tâche ASYNC avec ID temp, archivage différé`);
    }

    console.log();
    console.log(`${colors.green}✅ TEST TERMINÉ AVEC SUCCÈS${colors.reset}`);

  } catch (error: any) {
    console.error(`${colors.red}❌ Erreur:${colors.reset}`, error.response?.data || error.message);
    process.exit(1);
  }
}

// Lancer les tests
testPerformance().catch(console.error);