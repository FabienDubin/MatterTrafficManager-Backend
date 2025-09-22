#!/usr/bin/env node
/**
 * Script de test pour vérifier que l'endpoint calendar retourne les données enrichies
 * Usage: npm run test:calendar-endpoint
 */

import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import logger from '../config/logger.config';

// Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '../../.env') });

const API_URL = process.env.API_URL || 'http://localhost:5005';

async function testCalendarEndpoint() {
  logger.info("🧪 Test de l'endpoint /api/tasks/calendar avec batch resolver...\n");

  try {
    // 1. D'abord, créer un token d'authentification (ou utiliser un existant)
    logger.info('1️⃣ Authentification...');
    let token: string;

    try {
      const loginResponse = await axios.post(`${API_URL}/api/v1/auth/login`, {
        email: 'admin@matter.com',
        password: 'admin123!', // Le ! est safe ici dans une string TypeScript
      });
      token = loginResponse.data.data.accessToken;
      logger.info('   ✅ Authentification réussie');
    } catch (error: any) {
      logger.error(
        "   ❌ Échec de l'authentification. Assurez-vous que le serveur est lancé et que l'utilisateur admin existe."
      );
      logger.error('   Détails:', error.message);
      if (error.response) {
        logger.error('   Réponse du serveur:', error.response.data);
      }
      logger.info("   💡 Lancez: npm run seed:admin pour créer l'utilisateur admin");
      process.exit(1);
    }

    // 2. Définir la période de test (7 jours avant et après aujourd'hui)
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 7);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 7);

    const params = {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };

    logger.info(`\n2️⃣ Test de l'endpoint calendar (${params.startDate} → ${params.endDate})...`);

    // 3. Appeler l'endpoint
    const startTime = Date.now();
    const response = await axios.get(`${API_URL}/api/v1/tasks/calendar`, {
      params,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const responseTime = Date.now() - startTime;

    const { data } = response.data;

    logger.info(`   ✅ Réponse reçue en ${responseTime}ms`);
    logger.info(`   📊 ${data.tasks.length} tâches récupérées`);

    // 4. Vérifier que les données sont enrichies
    logger.info("\n3️⃣ Vérification de l'enrichissement des données...");

    let hasEnrichedData = false;
    let sampleTask: any = null;

    for (const task of data.tasks) {
      if (task.assignedMembersData && task.assignedMembersData.length > 0) {
        hasEnrichedData = true;
        sampleTask = task;
        break;
      }
    }

    if (hasEnrichedData && sampleTask) {
      logger.info('   ✅ Les données sont enrichies avec le batch resolver!');

      // Afficher un exemple de tâche enrichie
      logger.info('\n4️⃣ Exemple de tâche enrichie:');
      logger.info(`   📌 Tâche: ${sampleTask.title}`);

      // Membres assignés
      if (sampleTask.assignedMembersData && sampleTask.assignedMembersData.length > 0) {
        logger.info('   👥 Membres assignés:');
        sampleTask.assignedMembersData.forEach((member: any) => {
          logger.info(`      - ${member.name} (${member.email})`);
          if (member.teams && member.teams.length > 0) {
            // Les teams du membre sont des IDs, on doit chercher les noms dans involvedTeamsData
            const memberTeamNames = member.teams.map((teamId: string) => {
              const team = sampleTask.involvedTeamsData?.find((t: any) => t.id === teamId);
              return team ? team.name : teamId;
            });
            logger.info(`        Équipes: ${memberTeamNames.join(', ')}`);
          }
        });
      }

      // Projet
      if (sampleTask.projectData) {
        logger.info(
          `   📁 Projet: ${sampleTask.projectData.name} (${sampleTask.projectData.status})`
        );
      }

      // Client
      if (sampleTask.clientData) {
        logger.info(`   🏢 Client: ${sampleTask.clientData.name}`);
      }

      // Équipes de la tâche
      if (sampleTask.teamsData && sampleTask.teamsData.length > 0) {
        logger.info('   🏷️ Équipes de la tâche:');
        sampleTask.teamsData.forEach((team: any) => {
          logger.info(`      - ${team.name}`);
        });
      }

      // Équipes impliquées (toutes les équipes des membres + équipes de la tâche)
      if (sampleTask.involvedTeamIds && sampleTask.involvedTeamIds.length > 0) {
        logger.info(`   🎯 Total d'équipes impliquées: ${sampleTask.involvedTeamIds.length}`);
        if (sampleTask.involvedTeamsData) {
          const teamNames = sampleTask.involvedTeamsData.map((t: any) => t.name).join(', ');
          logger.info(`      ${teamNames}`);
        }
      }
    } else {
      logger.warn('   ⚠️ Aucune tâche avec des données enrichies trouvée.');
      logger.info("   Cela peut être normal si aucune tâche n'a de membres assignés.");
    }

    // 5. Vérifier la structure de la réponse
    logger.info('\n5️⃣ Vérification de la structure de la réponse...');
    const hasCorrectStructure =
      data.tasks !== undefined && data.period !== undefined && data.cacheHit !== undefined;

    if (hasCorrectStructure) {
      logger.info('   ✅ Structure de la réponse correcte');
      logger.info(`   - Cache hit: ${data.cacheHit}`);
      logger.info(`   - Période: ${data.period.start} → ${data.period.end}`);
    } else {
      logger.error('   ❌ Structure de la réponse incorrecte');
    }

    // 6. Test de performance (2e appel pour vérifier le cache)
    logger.info('\n6️⃣ Test de performance avec cache...');
    const startTime2 = Date.now();
    await axios.get(`${API_URL}/api/v1/tasks/calendar`, {
      params,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const responseTime2 = Date.now() - startTime2;

    const improvement = Math.round(((responseTime - responseTime2) / responseTime) * 100);
    logger.info(`   1er appel: ${responseTime}ms`);
    logger.info(`   2e appel (cache): ${responseTime2}ms`);
    if (improvement > 0) {
      logger.info(`   ⚡ Amélioration: ${improvement}% plus rapide`);
    }

    logger.info("\n✅ Test de l'endpoint calendar terminé avec succès!");
    logger.info('   Le batch resolver enrichit correctement les données.');
  } catch (error: any) {
    logger.error('❌ Erreur lors du test:', error.message);
    if (error.response) {
      logger.error('   Status:', error.response.status);
      logger.error('   Réponse du serveur:', JSON.stringify(error.response.data, null, 2));
    }
    logger.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Exécuter le test
testCalendarEndpoint()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    logger.error('Erreur fatale:', error);
    process.exit(1);
  });
