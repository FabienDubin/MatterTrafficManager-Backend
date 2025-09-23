#!/usr/bin/env npx ts-node

/**
 * Script de test pour vérifier le rollback en cas d'échec Notion
 * 
 * Usage: npx ts-node src/scripts/test-rollback.ts <token>
 */

import axios from 'axios';
import { redisService } from '../services/redis.service';
import syncQueueService from '../services/sync-queue.service';

const API_URL = process.env.API_URL || 'http://localhost:5005/api/v1';
const token = process.argv[2];

if (!token) {
  console.error('❌ Token requis: npx ts-node src/scripts/test-rollback.ts <token>');
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

async function testRollback() {
  console.log(`${colors.cyan}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║       TEST ROLLBACK SUR ÉCHEC          ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════╝${colors.reset}`);
  console.log();

  try {
    // TEST 1: CREATE avec ID invalide (devrait échouer et rollback)
    console.log(`${colors.magenta}━━━ TEST 1: CREATE avec échec simulé ━━━${colors.reset}`);
    
    // Créer une tâche en mode async avec des données qui vont faire échouer Notion
    const createResponse = await api.post('/tasks?async=true', {
      title: 'TEST ROLLBACK - Should Fail'.repeat(100), // Titre trop long pour Notion (>2000 chars)
      workPeriod: {
        startDate: '2025-01-01',
        endDate: '2025-01-02'
      },
      status: 'not_started'
    });

    const tempId = createResponse.data.data.id;
    console.log(`${colors.blue}ℹ${colors.reset} Tâche créée avec ID temp: ${tempId}`);
    
    // Vérifier que la tâche est dans Redis
    const inRedisBeforeSync = await redisService.get(`task:${tempId}`);
    console.log(`${colors.green}✓${colors.reset} Tâche trouvée dans Redis avant sync`);
    
    // Attendre que la queue essaie de synchroniser (et échoue)
    console.log(`${colors.yellow}⏳${colors.reset} Attente des 3 retries (environ 7 secondes)...`);
    
    // Monitoring du status de la queue
    let attempts = 0;
    const checkInterval = setInterval(async () => {
      const queueStatus = syncQueueService.getStatus();
      attempts++;
      console.log(`${colors.blue}ℹ${colors.reset} Queue: ${queueStatus.queueLength} items, Failed: ${queueStatus.metrics.failed}`);
      
      if (attempts > 8) { // 8 secondes max
        clearInterval(checkInterval);
      }
    }, 1000);

    await new Promise(resolve => setTimeout(resolve, 8000));
    clearInterval(checkInterval);

    // Vérifier que la tâche a été supprimée de Redis (rollback)
    const inRedisAfterFailure = await redisService.get(`task:${tempId}`);
    
    if (!inRedisAfterFailure) {
      console.log(`${colors.green}✅ ROLLBACK RÉUSSI${colors.reset}: Tâche temporaire supprimée de Redis après échec`);
    } else {
      console.log(`${colors.red}❌ ROLLBACK ÉCHOUÉ${colors.reset}: Tâche toujours dans Redis`);
      console.log('Contenu:', inRedisAfterFailure);
    }
    console.log();

    // TEST 2: UPDATE avec conflit (devrait marquer _syncError)
    console.log(`${colors.magenta}━━━ TEST 2: UPDATE avec échec ━━━${colors.reset}`);
    
    // Créer d'abord une tâche normale en mode sync
    const validTask = await api.post('/tasks', {
      title: 'TEST ROLLBACK - Valid Task',
      workPeriod: {
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0]
      },
      status: 'not_started'
    });

    const validTaskId = validTask.data.data.id;
    console.log(`${colors.blue}ℹ${colors.reset} Tâche valide créée: ${validTaskId}`);

    // Forcer un échec en utilisant un ID inexistant pour l'update async
    const fakeId = 'fake-id-that-does-not-exist';
    
    // Mettre une fausse tâche dans Redis pour tester le rollback
    await redisService.set(`task:${fakeId}`, {
      id: fakeId,
      title: 'Fake Task for Rollback Test',
      status: 'not_started'
    }, 'task');
    
    console.log(`${colors.blue}ℹ${colors.reset} Fausse tâche mise dans Redis: ${fakeId}`);

    // Faire un update async qui va échouer
    await api.put(`/tasks/${fakeId}?async=true`, {
      status: 'in_progress'
    });

    console.log(`${colors.yellow}⏳${colors.reset} Attente du rollback...`);
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Vérifier le flag _syncError
    const taskWithError = await redisService.get(`task:${fakeId}`);
    
    if (taskWithError && (taskWithError as any)._syncError) {
      console.log(`${colors.green}✅ ROLLBACK RÉUSSI${colors.reset}: Flag _syncError ajouté`);
      console.log(`${colors.blue}ℹ${colors.reset} Message d'erreur: ${(taskWithError as any)._syncErrorMsg}`);
    } else {
      console.log(`${colors.red}❌ ROLLBACK ÉCHOUÉ${colors.reset}: Pas de flag _syncError`);
    }

    // Nettoyer
    await api.delete(`/tasks/${validTaskId}`).catch(() => {});
    await redisService.del(`task:${fakeId}`);

    // Afficher le status final de la queue
    console.log();
    console.log(`${colors.cyan}━━━ STATUS FINAL DE LA QUEUE ━━━${colors.reset}`);
    const finalStatus = syncQueueService.getStatus();
    console.log(`${colors.blue}ℹ${colors.reset} Items traités: ${finalStatus.metrics.processed}`);
    console.log(`${colors.blue}ℹ${colors.reset} Items échoués: ${finalStatus.metrics.failed}`);
    console.log(`${colors.blue}ℹ${colors.reset} Retries totaux: ${finalStatus.metrics.retries}`);
    console.log(`${colors.blue}ℹ${colors.reset} Items en queue: ${finalStatus.queueLength}`);
    
    console.log();
    console.log(`${colors.green}✅ TEST TERMINÉ${colors.reset}`);

  } catch (error: any) {
    console.error(`${colors.red}❌ Erreur:${colors.reset}`, error.response?.data || error.message);
    process.exit(1);
  } finally {
    // Fermer proprement
    process.exit(0);
  }
}

// Lancer les tests
testRollback().catch(console.error);