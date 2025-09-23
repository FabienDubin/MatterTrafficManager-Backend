#!/usr/bin/env ts-node

import axios, { AxiosInstance } from 'axios';
import { format } from 'date-fns';

/**
 * Script de test pour les endpoints CRUD de Tasks
 * Usage: npx ts-node src/scripts/test-crud-endpoints.ts
 */

// Configuration
const API_BASE_URL = 'http://localhost:5005/api/v1';
const AUTH_TOKEN =
  process.env.AUTH_TOKEN ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGM3ZWM0NTc4NGJkZWFiZjBhOGE1OTQiLCJlbWFpbCI6ImFkbWluQG1hdHRlci5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NTg2MTc4NTgsImV4cCI6MTc1ODY0NjY1OH0.WHSZ298axC2YCXMrFYlZSAx7c6VvRrHBuUVEl-adgOk';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

// Test data
let createdTaskId: string | null = null;
const testDate = new Date();
testDate.setDate(testDate.getDate() + 7); // 7 days from now

const testTask = {
  title: `Test Task CRUD - ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`,
  workPeriod: {
    startDate: format(testDate, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
    endDate: format(new Date(testDate.getTime() + 86400000), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"), // +1 day
  },
  taskType: 'task' as const,
  status: 'not_started' as const,
  notes: 'This is a test task created by the CRUD test script',
  billedHours: 8,
  actualHours: 0,
  addToCalendar: true,
  clientPlanning: false,
};

// Create axios instance with auth
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Helper functions
function logSuccess(message: string) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message: string) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function logSection(title: string) {
  console.log(`\n${colors.magenta}━━━ ${title} ━━━${colors.reset}`);
}

// Test functions
async function testGetCalendarTasks() {
  logSection('TEST 1: GET /tasks/calendar');

  try {
    const response = await api.get('/tasks/calendar', {
      params: {
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'), // +30 days
      },
    });

    if (response.data.success) {
      logSuccess(`Récupéré ${response.data.meta.count} tâches du calendrier`);
      logInfo(`Cache hit: ${response.data.data.cacheHit}`);
      return true;
    } else {
      logError('Échec de la récupération des tâches');
      return false;
    }
  } catch (error: any) {
    logError(`Erreur: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function testCreateTask() {
  logSection('TEST 2: POST /tasks');

  try {
    logInfo(`Création d'une tâche: "${testTask.title}"`);

    const response = await api.post('/tasks', testTask);

    if (response.status === 201 && response.data.success) {
      createdTaskId = response.data.data.id;
      logSuccess(`Tâche créée avec l'ID: ${createdTaskId}`);
      logInfo(`Titre: ${response.data.data.title}`);
      return true;
    } else {
      logError('Échec de la création de la tâche');
      return false;
    }
  } catch (error: any) {
    logError(`Erreur: ${error.response?.data?.error || error.message}`);
    if (error.response?.data?.details) {
      console.log('Détails de validation:', JSON.stringify(error.response.data.details, null, 2));
    }
    return false;
  }
}

async function testGetTaskById() {
  logSection('TEST 3: GET /tasks/:id');

  if (!createdTaskId) {
    logError("Pas d'ID de tâche disponible (la création a échoué)");
    return false;
  }

  try {
    const response = await api.get(`/tasks/${createdTaskId}`);

    if (response.data.success) {
      logSuccess(`Tâche récupérée: ${response.data.data.title}`);
      logInfo(`ID: ${response.data.data.id}`);
      return true;
    } else {
      logError('Échec de la récupération de la tâche');
      return false;
    }
  } catch (error: any) {
    logError(`Erreur: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function testUpdateTask() {
  logSection('TEST 4: PUT /tasks/:id');

  if (!createdTaskId) {
    logError("Pas d'ID de tâche disponible (la création a échoué)");
    return false;
  }

  const updateData = {
    title: `${testTask.title} - UPDATED`,
    status: 'in_progress' as const,
    actualHours: 2,
    notes: 'Updated via test script',
  };

  try {
    logInfo('Mise à jour de la tâche...');

    const response = await api.put(`/tasks/${createdTaskId}`, updateData);

    if (response.data.success) {
      logSuccess(`Tâche mise à jour: ${response.data.data.title}`);
      logInfo(`Statut: ${response.data.data.status}`);
      return true;
    } else {
      logError('Échec de la mise à jour de la tâche');
      return false;
    }
  } catch (error: any) {
    logError(`Erreur: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function testBatchUpdate() {
  logSection('TEST 5: POST /tasks/batch');

  if (!createdTaskId) {
    logError("Pas d'ID de tâche disponible pour le batch update");
    return false;
  }

  const batchData = {
    updates: [
      {
        id: createdTaskId,
        data: {
          status: 'completed',
          actualHours: 8,
          notes: 'Completed via batch update',
        },
      },
    ],
  };

  try {
    logInfo('Batch update de la tâche...');

    const response = await api.post('/tasks/batch', batchData);

    if (response.data.success || response.status === 207) {
      const summary = response.data.data.summary;
      logSuccess(`Batch update terminé: ${summary.succeeded}/${summary.total} réussi(s)`);

      if (summary.failed > 0) {
        logError(`${summary.failed} échec(s)`);
        response.data.data.failed.forEach((fail: any) => {
          logError(`  - ID ${fail.id}: ${fail.error}`);
        });
      }
      return summary.failed === 0;
    } else {
      logError('Échec du batch update');
      return false;
    }
  } catch (error: any) {
    logError(`Erreur: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function testDeleteTask() {
  logSection('TEST 6: DELETE /tasks/:id');

  if (!createdTaskId) {
    logError("Pas d'ID de tâche disponible (la création a échoué)");
    return false;
  }

  try {
    logInfo(`Archivage de la tâche ${createdTaskId}...`);

    const response = await api.delete(`/tasks/${createdTaskId}`);

    if (response.data.success) {
      logSuccess('Tâche archivée avec succès');
      return true;
    } else {
      logError("Échec de l'archivage de la tâche");
      return false;
    }
  } catch (error: any) {
    logError(`Erreur: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function testInvalidRequests() {
  logSection('TEST 7: Requêtes invalides');

  let failedAsExpected = 0;
  let totalTests = 0;

  // Test 1: Create without required fields
  totalTests++;
  try {
    await api.post('/tasks', { title: 'Test' });
    logError('La création sans workPeriod aurait dû échouer');
  } catch (error: any) {
    if (error.response?.status === 400) {
      logSuccess('Validation échouée comme prévu (champs requis manquants)');
      failedAsExpected++;
    }
  }

  // Test 2: Invalid date format
  totalTests++;
  try {
    await api.post('/tasks', {
      title: 'Test',
      workPeriod: {
        startDate: 'invalid-date',
        endDate: '2025-01-01',
      },
    });
    logError('La création avec une date invalide aurait dû échouer');
  } catch (error: any) {
    if (error.response?.status === 400) {
      logSuccess('Validation échouée comme prévu (format de date invalide)');
      failedAsExpected++;
    }
  }

  // Test 3: Get non-existent task
  totalTests++;
  try {
    await api.get('/tasks/non-existent-id-12345');
    logError("La récupération d'une tâche inexistante aurait dû échouer");
  } catch (error: any) {
    if (error.response?.status === 404 || error.response?.status === 500) {
      logSuccess('Échec comme prévu pour une tâche inexistante');
      failedAsExpected++;
    }
  }

  logInfo(`${failedAsExpected}/${totalTests} tests de validation réussis`);
  return failedAsExpected === totalTests;
}

// Main test runner
async function runTests() {
  console.log(`${colors.yellow}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.yellow}║   TEST DES ENDPOINTS CRUD DE TASKS    ║${colors.reset}`);
  console.log(`${colors.yellow}╚════════════════════════════════════════╝${colors.reset}`);

  console.log(`\n${colors.blue}Configuration:${colors.reset}`);
  console.log(`  API URL: ${API_BASE_URL}`);
  console.log(`  Token: ${AUTH_TOKEN.substring(0, 20)}...`);

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
  };

  // Run tests in sequence
  const tests = [
    { name: 'Get Calendar Tasks', fn: testGetCalendarTasks },
    { name: 'Create Task', fn: testCreateTask },
    { name: 'Get Task by ID', fn: testGetTaskById },
    { name: 'Update Task', fn: testUpdateTask },
    { name: 'Batch Update', fn: testBatchUpdate },
    // { name: 'Delete Task', fn: testDeleteTask },
    { name: 'Invalid Requests', fn: testInvalidRequests },
  ];

  for (const test of tests) {
    results.total++;
    try {
      const passed = await test.fn();
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      results.failed++;
      logError(`Test "${test.name}" a crashé: ${error}`);
    }
  }

  // Summary
  logSection('RÉSUMÉ DES TESTS');
  console.log(`Total: ${results.total}`);
  console.log(`${colors.green}Réussis: ${results.passed}${colors.reset}`);
  console.log(`${colors.red}Échoués: ${results.failed}${colors.reset}`);

  if (results.failed === 0) {
    console.log(`\n${colors.green}🎉 TOUS LES TESTS SONT PASSÉS !${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}❌ ${results.failed} test(s) ont échoué${colors.reset}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });
}

export { runTests };
