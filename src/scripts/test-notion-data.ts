import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Now import services after env vars are loaded
import notionService from '../services/notion.service';
import logger from '../config/logger.config';

/**
 * Script pour tester et vérifier les données reçues de Notion
 * Objectif: S'assurer que les données transformées sont correctes avant mise en cache Redis
 */
async function testNotionData() {
  console.log('\n🔍 TEST DES DONNÉES NOTION\n');
  console.log('=====================================\n');

  try {
    // 1. Test de connexion Notion
    console.log('1️⃣  Test de connexion Notion...');
    const connected = await notionService.testConnection();
    console.log(`   ✅ Connexion Notion: ${connected ? 'OK' : 'FAILED'}\n`);

    // 2. Récupérer une TÂCHE
    console.log("2️⃣  Récupération d'une tâche (Traffic database)...");
    const tasksResult = await notionService.queryTrafficDatabase(undefined, 1);
    if (tasksResult.results.length > 0) {
      const task = tasksResult.results[0];
      if (task) {
        console.log('   📋 TÂCHE RÉCUPÉRÉE:');
        console.log('   ├── ID:', task.id);
        console.log('   ├── Title:', task.title);
        console.log('   ├── Status:', task.status);
        console.log('   ├── Task Type:', task.taskType);
        console.log('   ├── Work Period:', {
          start: task.workPeriod.startDate,
          end: task.workPeriod.endDate,
        });
        console.log('   ├── Assigned Members:', task.assignedMembers);
        console.log('   ├── Project ID:', task.projectId);
        console.log('   ├── Billed Hours:', task.billedHours);
        console.log('   ├── Actual Hours:', task.actualHours);
        console.log('   ├── Add to Calendar:', task.addToCalendar);
        console.log('   ├── Client Planning:', task.clientPlanning);
        console.log('   ├── Notes:', task.notes ? task.notes.substring(0, 50) + '...' : 'N/A');
        console.log('   └── Created/Updated:', task.createdAt, '/', task.updatedAt);

        console.log('\n   🔧 Structure JSON complète (pour Redis):');
        console.log(
          JSON.stringify(task, null, 2)
            .split('\n')
            .slice(0, 20)
            .map(line => '   ' + line)
            .join('\n')
        );
        console.log('   ... (tronqué)\n');
      }
    } else {
      console.log('   ⚠️  Aucune tâche trouvée\n');
    }

    // 3. Récupérer un PROJET
    console.log("3️⃣  Récupération d'un projet (Projects database)...");
    const projectsResult = await notionService.queryProjectsDatabase(undefined, undefined, 1);
    if (projectsResult.results.length > 0) {
      const project = projectsResult.results[0];
      if (project) {
        console.log('   🚀 PROJET RÉCUPÉRÉ:');
        console.log('   ├── ID:', project.id);
        console.log('   ├── Name:', project.name);
        console.log('   ├── Status:', project.status);
        console.log('   ├── Client ID:', project.client);
        console.log('   └── Tasks:', project.tasks?.length || 0, 'tâche(s)');

        console.log('\n   🔧 Structure JSON complète (pour Redis):');
        console.log(
          JSON.stringify(project, null, 2)
            .split('\n')
            .map(line => '   ' + line)
            .join('\n')
        );
        console.log();
      }
    } else {
      console.log('   ⚠️  Aucun projet trouvé\n');
    }

    // 4. Récupérer un CLIENT
    console.log("4️⃣  Récupération d'un client (Clients database)...");
    const clientsResult = await notionService.queryClientsDatabase(undefined, 1);
    if (clientsResult.results.length > 0) {
      const client = clientsResult.results[0];
      if (client) {
        console.log('   🏢 CLIENT RÉCUPÉRÉ:');
        console.log('   ├── ID:', client.id);
        console.log('   ├── Name:', client.name);
        console.log('   └── Projects:', client.projects?.length || 0, 'projet(s)');
      }

      console.log('\n   🔧 Structure JSON complète (pour Redis):');
      console.log(
        JSON.stringify(client, null, 2)
          .split('\n')
          .map(line => '   ' + line)
          .join('\n')
      );
      console.log();
    } else {
      console.log('   ⚠️  Aucun client trouvé\n');
    }

    // 5. Récupérer un MEMBRE (User)
    console.log("5️⃣  Récupération d'un membre (Users database)...");
    const usersResult = await notionService.queryUsersDatabase(undefined, 1);
    if (usersResult.results.length > 0) {
      const user = usersResult.results[0];
      if (user) {
        console.log('   👤 MEMBRE RÉCUPÉRÉ:');
        console.log('   ├── ID:', user.id);
        console.log('   ├── Name:', user.name);
        console.log('   ├── Email:', user.email);
        console.log('   ├── Team ID:', user.team);
        console.log('   └── Tasks:', user.tasks?.length || 0, 'tâche(s)');
      }

      console.log('\n   🔧 Structure JSON complète (pour Redis):');
      console.log(
        JSON.stringify(user, null, 2)
          .split('\n')
          .map(line => '   ' + line)
          .join('\n')
      );
      console.log();
    } else {
      console.log('   ⚠️  Aucun membre trouvé\n');
    }

    // 6. Récupérer une ÉQUIPE
    console.log("6️⃣  Récupération d'une équipe (Teams database)...");
    const teamsResult = await notionService.queryTeamsDatabase(undefined, 1);
    if (teamsResult.results.length > 0) {
      const team = teamsResult.results[0];
      if (team) {
        console.log('   👥 ÉQUIPE RÉCUPÉRÉE:');
        console.log('   ├── ID:', team.id);
        console.log('   ├── Name:', team.name);
        console.log('   └── Members:', team.members?.length || 0, 'membre(s)');
      }
      console.log('\n   🔧 Structure JSON complète (pour Redis):');
      console.log(
        JSON.stringify(team, null, 2)
          .split('\n')
          .map(line => '   ' + line)
          .join('\n')
      );
      console.log();
    } else {
      console.log('   ⚠️  Aucune équipe trouvée\n');
    }

    // 7. Résumé des types de données
    console.log('7️⃣  RÉSUMÉ DES STRUCTURES DE DONNÉES\n');
    console.log('   Ces données seront stockées dans Redis avec les TTLs suivants:');
    console.log('   ├── Tasks: 1h (3600s)');
    console.log('   ├── Projects: 24h (86400s)');
    console.log('   ├── Clients: 12h (43200s)');
    console.log('   ├── Members/Users: 7j (604800s)');
    console.log('   └── Teams: 7j (604800s)');

    console.log('\n   📦 Format de stockage Redis:');
    console.log('   - Clé: {type}:{id} (ex: task:abc-123-def)');
    console.log("   - Valeur: JSON stringifié de l'objet");
    console.log("   - TTL: Selon le type d'entité\n");

    console.log('✅ Test terminé avec succès!\n');
    console.log('=====================================\n');
  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
    logger.error('Test Notion data failed', error);
  } finally {
    process.exit(0);
  }
}

// Run the test
testNotionData().catch(console.error);
