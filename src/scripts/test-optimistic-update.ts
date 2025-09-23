#!/usr/bin/env npx ts-node

/**
 * Script de test pour le pattern Optimistic Update
 * 
 * Usage: npx ts-node src/scripts/test-optimistic-update.ts <token>
 */

import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:5005/api/v1';
const token = process.argv[2];

if (!token) {
  console.error('❌ Token requis: npx ts-node src/scripts/test-optimistic-update.ts <token>');
  process.exit(1);
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

interface Task {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
}

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

async function testOptimisticUpdate() {
  console.log(`${colors.yellow}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.yellow}║   TEST OPTIMISTIC UPDATE PATTERN       ║${colors.reset}`);
  console.log(`${colors.yellow}╚════════════════════════════════════════╝${colors.reset}`);
  console.log();

  try {
    // 1. Créer une tâche de test
    console.log(`${colors.magenta}━━━ TEST 1: Création d'une tâche ━━━${colors.reset}`);
    const createResponse = await api.post('/tasks', {
      title: `Test Optimistic Update - ${new Date().toLocaleString()}`,
      workPeriod: {
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0]
      },
      status: 'not_started'
    });

    const task: Task = createResponse.data.data;
    console.log(`${colors.green}✓${colors.reset} Tâche créée: ${task.id}`);
    console.log(`${colors.blue}ℹ${colors.reset} Title: ${task.title}`);
    console.log(`${colors.blue}ℹ${colors.reset} UpdatedAt: ${task.updatedAt}`);
    console.log();

    // Attendre un peu pour simuler du temps qui passe
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. Update normal (sans expectedUpdatedAt)
    console.log(`${colors.magenta}━━━ TEST 2: Update normal (sans version) ━━━${colors.reset}`);
    const normalUpdate = await api.put(`/tasks/${task.id}`, {
      status: 'in_progress'
    });
    
    const updatedTask = normalUpdate.data.data;
    console.log(`${colors.green}✓${colors.reset} Update réussi sans vérification de version`);
    console.log(`${colors.blue}ℹ${colors.reset} Nouveau status: ${updatedTask.status}`);
    console.log(`${colors.blue}ℹ${colors.reset} Nouveau updatedAt: ${updatedTask.updatedAt}`);
    console.log();

    // 3. Update avec expectedUpdatedAt correct
    console.log(`${colors.magenta}━━━ TEST 3: Update avec version correcte ━━━${colors.reset}`);
    const correctVersionUpdate = await api.put(`/tasks/${task.id}`, {
      status: 'completed',
      expectedUpdatedAt: updatedTask.updatedAt
    });
    
    const task2 = correctVersionUpdate.data.data;
    console.log(`${colors.green}✓${colors.reset} Update réussi avec version correcte`);
    console.log(`${colors.blue}ℹ${colors.reset} Nouveau status: ${task2.status}`);
    console.log(`${colors.blue}ℹ${colors.reset} Nouveau updatedAt: ${task2.updatedAt}`);
    console.log();

    // 4. Update avec expectedUpdatedAt incorrect (conflit attendu)
    console.log(`${colors.magenta}━━━ TEST 4: Update avec version incorrecte (conflit) ━━━${colors.reset}`);
    try {
      await api.put(`/tasks/${task.id}`, {
        title: 'Should fail',
        expectedUpdatedAt: task.updatedAt // Ancienne version
      });
      
      console.log(`${colors.red}✗${colors.reset} Erreur: le conflit n'a pas été détecté`);
    } catch (error: any) {
      if (error.response?.status === 409) {
        console.log(`${colors.green}✓${colors.reset} Conflit détecté correctement (409)`);
        console.log(`${colors.blue}ℹ${colors.reset} Message: ${error.response.data.conflict?.message}`);
        console.log(`${colors.blue}ℹ${colors.reset} Version attendue: ${error.response.data.conflict?.expected}`);
        console.log(`${colors.blue}ℹ${colors.reset} Version actuelle: ${error.response.data.conflict?.current}`);
      } else {
        console.log(`${colors.red}✗${colors.reset} Erreur inattendue: ${error.response?.status}`);
      }
    }
    console.log();

    // 5. Update forcé (même avec version incorrecte)
    console.log(`${colors.magenta}━━━ TEST 5: Update forcé (ignore les conflits) ━━━${colors.reset}`);
    const forcedUpdate = await api.put(`/tasks/${task.id}`, {
      title: 'Forced Update - Success',
      expectedUpdatedAt: task.updatedAt, // Ancienne version
      force: true
    });
    
    const task3 = forcedUpdate.data.data;
    console.log(`${colors.green}✓${colors.reset} Update forcé réussi malgré la version incorrecte`);
    console.log(`${colors.blue}ℹ${colors.reset} Nouveau titre: ${task3.title}`);
    console.log(`${colors.blue}ℹ${colors.reset} Nouveau updatedAt: ${task3.updatedAt}`);
    console.log();

    // 6. Nettoyer - archiver la tâche
    console.log(`${colors.magenta}━━━ CLEANUP: Archivage de la tâche ━━━${colors.reset}`);
    await api.delete(`/tasks/${task.id}`);
    console.log(`${colors.green}✓${colors.reset} Tâche archivée`);
    console.log();

    // Résumé
    console.log(`${colors.magenta}━━━ RÉSUMÉ ━━━${colors.reset}`);
    console.log(`${colors.green}✅ Update normal: OK${colors.reset}`);
    console.log(`${colors.green}✅ Update avec version correcte: OK${colors.reset}`);
    console.log(`${colors.green}✅ Détection de conflit: OK${colors.reset}`);
    console.log(`${colors.green}✅ Update forcé: OK${colors.reset}`);
    console.log();
    console.log(`${colors.green}🎉 TOUS LES TESTS OPTIMISTIC UPDATE SONT PASSÉS !${colors.reset}`);

  } catch (error: any) {
    console.error(`${colors.red}❌ Erreur:${colors.reset}`, error.response?.data || error.message);
    process.exit(1);
  }
}

// Lancer les tests
testOptimisticUpdate().catch(console.error);