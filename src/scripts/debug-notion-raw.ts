import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Import Notion client directly
import { notion, DATABASES } from '../config/notion.config';

/**
 * Script de debug pour voir les données BRUTES de Notion
 * Objectif: Comprendre pourquoi le mapping ne fonctionne pas
 */
async function debugNotionRaw() {
  console.log('\n🔬 DEBUG: DONNÉES BRUTES NOTION\n');
  console.log('=====================================\n');

  try {
    // 1. Récupérer une tâche BRUTE
    console.log('1️⃣  TÂCHE BRUTE (Traffic database)...\n');
    const taskResponse = await notion.databases.query({
      database_id: DATABASES.traffic,
      page_size: 1
    });

    if (taskResponse.results.length > 0) {
      const rawTask = taskResponse.results[0] as any;
      console.log('📋 ID de la page:', rawTask.id);
      console.log('\n🔍 PROPRIÉTÉS BRUTES:');
      console.log('─────────────────────');
      
      // Afficher toutes les clés des propriétés
      const properties = rawTask.properties;
      const propertyKeys = Object.keys(properties);
      
      console.log('\n📌 Clés des propriétés trouvées:');
      propertyKeys.forEach(key => {
        console.log(`   - "${key}"`);
      });

      console.log('\n📊 Détail de chaque propriété:');
      console.log('───────────────────────────────');
      
      for (const [key, value] of Object.entries(properties)) {
        const prop = value as any;
        console.log(`\n🔹 Propriété: "${key}"`);
        console.log(`   Type: ${prop.type}`);
        console.log(`   ID: ${prop.id}`);
        
        // Afficher la valeur selon le type
        switch (prop.type) {
          case 'title':
            console.log(`   Valeur: ${prop.title?.length > 0 ? prop.title[0]?.plain_text : '(vide)'}`);
            break;
          case 'rich_text':
            console.log(`   Valeur: ${prop.rich_text?.length > 0 ? prop.rich_text[0]?.plain_text : '(vide)'}`);
            break;
          case 'select':
            console.log(`   Valeur: ${prop.select?.name || '(vide)'}`);
            break;
          case 'number':
            console.log(`   Valeur: ${prop.number ?? '(vide)'}`);
            break;
          case 'checkbox':
            console.log(`   Valeur: ${prop.checkbox}`);
            break;
          case 'date':
            console.log(`   Valeur: ${prop.date ? JSON.stringify(prop.date) : '(vide)'}`);
            break;
          case 'relation':
            console.log(`   Valeur: ${prop.relation?.length || 0} relation(s)`);
            if (prop.relation?.length > 0) {
              prop.relation.forEach((rel: any) => console.log(`      - ${rel.id}`));
            }
            break;
          case 'email':
            console.log(`   Valeur: ${prop.email || '(vide)'}`);
            break;
          default:
            console.log(`   Valeur: ${JSON.stringify(prop[prop.type] || '(type inconnu)')}`);
        }
      }

      console.log('\n\n💾 JSON COMPLET DE LA PAGE (pour référence):');
      console.log('─────────────────────────────────────────────');
      console.log(JSON.stringify(rawTask, null, 2).substring(0, 2000));
      console.log('... (tronqué à 2000 caractères)\n');
    }

    // 2. Récupérer un projet BRUT
    console.log('\n2️⃣  PROJET BRUT (Projects database)...\n');
    const projectResponse = await notion.databases.query({
      database_id: DATABASES.projects,
      page_size: 1
    });

    if (projectResponse.results.length > 0) {
      const rawProject = projectResponse.results[0] as any;
      console.log('🚀 ID de la page:', rawProject.id);
      console.log('\n📌 Clés des propriétés trouvées:');
      Object.keys(rawProject.properties).forEach(key => {
        console.log(`   - "${key}"`);
      });
    }

    // 3. Récupérer un client BRUT
    console.log('\n3️⃣  CLIENT BRUT (Clients database)...\n');
    const clientResponse = await notion.databases.query({
      database_id: DATABASES.clients,
      page_size: 1
    });

    if (clientResponse.results.length > 0) {
      const rawClient = clientResponse.results[0] as any;
      console.log('🏢 ID de la page:', rawClient.id);
      console.log('\n📌 Clés des propriétés trouvées:');
      Object.keys(rawClient.properties).forEach(key => {
        console.log(`   - "${key}"`);
      });
    }

    // 4. Récupérer un membre BRUT
    console.log('\n4️⃣  MEMBRE BRUT (Users database)...\n');
    const userResponse = await notion.databases.query({
      database_id: DATABASES.users,
      page_size: 1
    });

    if (userResponse.results.length > 0) {
      const rawUser = userResponse.results[0] as any;
      console.log('👤 ID de la page:', rawUser.id);
      console.log('\n📌 Clés des propriétés trouvées:');
      Object.keys(rawUser.properties).forEach(key => {
        console.log(`   - "${key}"`);
      });
    }

    // 5. Récupérer une équipe BRUTE
    console.log('\n5️⃣  ÉQUIPE BRUTE (Teams database)...\n');
    const teamResponse = await notion.databases.query({
      database_id: DATABASES.teams,
      page_size: 1
    });

    if (teamResponse.results.length > 0) {
      const rawTeam = teamResponse.results[0] as any;
      console.log('👥 ID de la page:', rawTeam.id);
      console.log('\n📌 Clés des propriétés trouvées:');
      Object.keys(rawTeam.properties).forEach(key => {
        console.log(`   - "${key}"`);
      });
    }

    console.log('\n\n🔴 COMPARAISON AVEC LA CONFIG:\n');
    console.log('─────────────────────────────');
    console.log('Les property IDs dans notion.config.ts sont encodés URL.');
    console.log('Il faut comparer avec les vraies clés trouvées ci-dessus.\n');
    console.log('Par exemple, pour TASK_PROPERTY_IDS:');
    console.log('  - title: "title" (devrait matcher)');
    console.log('  - workPeriod: "%40WIV" (URL encoded de "@WIV")');
    console.log('  - assignedMembers: "%60wMW" (URL encoded de "`wMW")');
    console.log('  - etc...\n');
    console.log('Si les clés ne correspondent pas, il faut les mettre à jour dans notion.config.ts\n');

    console.log('✅ Debug terminé!\n');
    console.log('=====================================\n');

  } catch (error) {
    console.error('❌ Erreur lors du debug:', error);
  } finally {
    process.exit(0);
  }
}

// Run debug
debugNotionRaw().catch(console.error);