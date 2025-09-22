#!/usr/bin/env node
/**
 * Script de test pour vérifier que le BatchResolver évite les N+1 queries
 * Usage: npm run test:batch-resolver
 */

import dotenv from 'dotenv';
import path from 'path';
import notionService from '../services/notion.service';
import logger from '../config/logger.config';

// Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '../../.env') });

interface TestResults {
  testName: string;
  passed: boolean;
  duration: number;
  details: any;
}

class BatchResolverTester {
  private results: TestResults[] = [];

  /**
   * Test 1: Vérifier que le batch loading fonctionne pour les membres
   */
  async testBatchLoadMembers(): Promise<TestResults> {
    const testName = 'Batch Load Members';
    const startTime = performance.now();
    
    try {
      logger.info(`\n📋 Test: ${testName}`);
      
      // Récupérer quelques tasks avec des membres assignés
      const tasks = await notionService.getAllTrafficTasks();
      const tasksWithMembers = tasks.filter(t => t.assignedMembers && t.assignedMembers.length > 0).slice(0, 5);
      
      if (tasksWithMembers.length === 0) {
        logger.warn('Aucune task avec des membres assignés trouvée');
        return {
          testName,
          passed: false,
          duration: performance.now() - startTime,
          details: { error: 'No tasks with assigned members found' }
        };
      }

      // Collecter tous les IDs de membres uniques
      const memberIds = new Set<string>();
      tasksWithMembers.forEach(task => {
        task.assignedMembers?.forEach(id => memberIds.add(id));
      });

      logger.info(`Loading ${memberIds.size} unique members from ${tasksWithMembers.length} tasks...`);

      // Charger tous les membres en batch
      const batchStartTime = performance.now();
      const members = await notionService.batchLoadMembers(Array.from(memberIds));
      const batchDuration = performance.now() - batchStartTime;

      const validMembers = members.filter(m => m !== null);
      logger.info(`✅ Loaded ${validMembers.length}/${memberIds.size} members in ${batchDuration.toFixed(2)}ms`);

      return {
        testName,
        passed: true,
        duration: performance.now() - startTime,
        details: {
          totalMemberIds: memberIds.size,
          loadedMembers: validMembers.length,
          batchLoadTime: batchDuration,
          avgTimePerMember: batchDuration / memberIds.size
        }
      };
    } catch (error) {
      logger.error(`❌ Test failed: ${testName}`, error);
      return {
        testName,
        passed: false,
        duration: performance.now() - startTime,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Test 2: Vérifier que batchResolveRelations résout toutes les relations
   */
  async testBatchResolveRelations(): Promise<TestResults> {
    const testName = 'Batch Resolve Relations';
    const startTime = performance.now();
    
    try {
      logger.info(`\n📋 Test: ${testName}`);
      
      // Récupérer quelques tasks, projects et teams
      const [tasks, projects, teams] = await Promise.all([
        notionService.getAllTrafficTasks().then(t => t.slice(0, 10)),
        notionService.getAllProjects().then(p => p.slice(0, 5)),
        notionService.getAllTeams().then(t => t.slice(0, 3))
      ]);

      logger.info(`Resolving relations for ${tasks.length} tasks, ${projects.length} projects, ${teams.length} teams...`);

      // Résoudre toutes les relations en batch
      const resolveStartTime = performance.now();
      const resolved = await notionService.batchResolveRelations({
        tasks,
        projects,
        teams
      });
      const resolveDuration = performance.now() - resolveStartTime;

      logger.info(`✅ Relations resolved in ${resolveDuration.toFixed(2)}ms`);
      logger.info(`   - Total queries: ${resolved.stats.totalQueries}`);
      logger.info(`   - Cached hits: ${resolved.stats.cachedHits}`);
      logger.info(`   - Notion fetches: ${resolved.stats.notionFetches}`);

      // Vérifier que les relations sont bien résolues
      let relationsFound = 0;
      resolved.resolvedTasks.forEach((task: any) => {
        if (task.assignedMembersData?.length > 0) relationsFound++;
        if (task.projectData) relationsFound++;
        if (task.clientData) relationsFound++;
        if (task.teamData) relationsFound++;
      });

      logger.info(`   - Relations found: ${relationsFound}`);

      return {
        testName,
        passed: true,
        duration: performance.now() - startTime,
        details: {
          entitiesProcessed: tasks.length + projects.length + teams.length,
          resolutionTime: resolveDuration,
          stats: resolved.stats,
          relationsFound
        }
      };
    } catch (error) {
      logger.error(`❌ Test failed: ${testName}`, error);
      return {
        testName,
        passed: false,
        duration: performance.now() - startTime,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Test 3: Comparer performance avec et sans batch loading
   */
  async testPerformanceComparison(): Promise<TestResults> {
    const testName = 'Performance Comparison';
    const startTime = performance.now();
    
    try {
      logger.info(`\n📋 Test: ${testName}`);
      
      // Récupérer 5 tasks avec des membres
      const tasks = await notionService.getAllTrafficTasks();
      const tasksWithMembers = tasks
        .filter(t => t.assignedMembers && t.assignedMembers.length > 0)
        .slice(0, 5);

      if (tasksWithMembers.length === 0) {
        logger.warn('Aucune task avec des membres assignés trouvée');
        return {
          testName,
          passed: false,
          duration: performance.now() - startTime,
          details: { error: 'No tasks with assigned members found' }
        };
      }

      const memberIds = new Set<string>();
      tasksWithMembers.forEach(task => {
        task.assignedMembers?.forEach(id => memberIds.add(id));
      });

      // Test 1: Sans batch loading (simulation N+1)
      logger.info(`\n1️⃣ Simulation N+1 queries (${memberIds.size} requêtes individuelles)...`);
      notionService.clearBatchResolverCache(); // Clear cache pour test équitable
      
      const n1StartTime = performance.now();
      const individualResults = [];
      for (const id of Array.from(memberIds)) {
        const member = await notionService.batchLoadMembers([id]);
        individualResults.push(member);
      }
      const n1Duration = performance.now() - n1StartTime;

      // Test 2: Avec batch loading
      logger.info(`\n2️⃣ Batch loading (1 requête groupée)...`);
      notionService.clearBatchResolverCache(); // Clear cache pour test équitable
      
      const batchStartTime = performance.now();
      const batchResults = await notionService.batchLoadMembers(Array.from(memberIds));
      const batchDuration = performance.now() - batchStartTime;

      // Calculer l'amélioration
      const improvement = ((n1Duration - batchDuration) / n1Duration * 100).toFixed(1);
      const speedup = (n1Duration / batchDuration).toFixed(2);

      logger.info(`\n📊 Résultats de performance:`);
      logger.info(`   - N+1 queries: ${n1Duration.toFixed(2)}ms`);
      logger.info(`   - Batch loading: ${batchDuration.toFixed(2)}ms`);
      logger.info(`   - Amélioration: ${improvement}% (${speedup}x plus rapide)`);

      return {
        testName,
        passed: batchDuration < n1Duration,
        duration: performance.now() - startTime,
        details: {
          memberCount: memberIds.size,
          n1Duration,
          batchDuration,
          improvement: `${improvement}%`,
          speedup: `${speedup}x`
        }
      };
    } catch (error) {
      logger.error(`❌ Test failed: ${testName}`, error);
      return {
        testName,
        passed: false,
        duration: performance.now() - startTime,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Test 4: Vérifier la cohérence des données avec cache
   */
  async testCacheConsistency(): Promise<TestResults> {
    const testName = 'Cache Consistency';
    const startTime = performance.now();
    
    try {
      logger.info(`\n📋 Test: ${testName}`);
      
      // Récupérer un membre
      const members = await notionService.getAllUsers();
      if (members.length === 0) {
        return {
          testName,
          passed: false,
          duration: performance.now() - startTime,
          details: { error: 'No members found' }
        };
      }

      const firstMember = members[0];
      if (!firstMember) {
        return {
          testName,
          passed: false,
          duration: performance.now() - startTime,
          details: { error: 'No member found at index 0' }
        };
      }
      
      const testMemberId = firstMember.id;
      logger.info(`Testing cache consistency for member: ${testMemberId}`);

      // Premier chargement (depuis Notion/Redis)
      notionService.clearBatchResolverCache();
      const firstLoad = await notionService.batchLoadMembers([testMemberId]);
      
      // Deuxième chargement (depuis DataLoader cache)
      const secondLoad = await notionService.batchLoadMembers([testMemberId]);
      
      // Vérifier que les données sont identiques
      const isConsistent = JSON.stringify(firstLoad) === JSON.stringify(secondLoad);
      
      logger.info(`✅ Cache consistency: ${isConsistent ? 'PASSED' : 'FAILED'}`);

      return {
        testName,
        passed: isConsistent,
        duration: performance.now() - startTime,
        details: {
          memberId: testMemberId,
          consistent: isConsistent,
          firstLoad: firstLoad[0],
          secondLoad: secondLoad[0]
        }
      };
    } catch (error) {
      logger.error(`❌ Test failed: ${testName}`, error);
      return {
        testName,
        passed: false,
        duration: performance.now() - startTime,
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Exécuter tous les tests
   */
  async runAllTests(): Promise<void> {
    logger.info('🚀 Démarrage des tests du BatchResolver...\n');
    
    const tests = [
      () => this.testBatchLoadMembers(),
      () => this.testBatchResolveRelations(),
      () => this.testPerformanceComparison(),
      () => this.testCacheConsistency()
    ];

    for (const test of tests) {
      const result = await test();
      this.results.push(result);
    }

    this.printSummary();
  }

  /**
   * Afficher le résumé des tests
   */
  private printSummary(): void {
    logger.info('\n' + '='.repeat(60));
    logger.info('📊 RÉSUMÉ DES TESTS');
    logger.info('='.repeat(60));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      logger.info(`${status} ${result.testName}: ${result.duration.toFixed(2)}ms`);
      if (!result.passed && result.details.error) {
        logger.error(`   Error: ${result.details.error}`);
      }
    });

    logger.info('='.repeat(60));
    logger.info(`Total: ${passed} passed, ${failed} failed`);
    logger.info(`Duration: ${totalDuration.toFixed(2)}ms`);
    
    if (failed === 0) {
      logger.info('\n🎉 Tous les tests sont passés avec succès!');
      logger.info('✅ Le BatchResolver évite bien les N+1 queries');
    } else {
      logger.error(`\n⚠️ ${failed} test(s) ont échoué`);
    }

    // Exit avec le bon code
    process.exit(failed === 0 ? 0 : 1);
  }
}

// Exécuter les tests
const tester = new BatchResolverTester();
tester.runAllTests().catch(error => {
  logger.error('Erreur fatale lors de l\'exécution des tests:', error);
  process.exit(1);
});