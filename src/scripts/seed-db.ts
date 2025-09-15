import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from '../config/logger.config';
import notionService from '../services/notion.service';

dotenv.config();

/**
 * Script de seed pour peupler la base MongoDB depuis Notion
 * Usage: npm run db:seed
 * 
 * NOTE: Ce script est un placeholder pour la Story 2.3
 * La synchronisation complète sera implémentée dans la Story 2.3
 */

async function validateNotionConnection() {
  logger.info('=== Validating Notion Connection ===');
  
  try {
    const result = await notionService.validateAllDatabases();
    
    if (!result.success) {
      logger.error('❌ Some Notion databases are not accessible');
      Object.entries(result.databases).forEach(([name, info]: [string, any]) => {
        if (!info.accessible) {
          logger.error(`  - ${name}: ${info.error}`);
        }
      });
      return false;
    }
    
    logger.info('✅ All Notion databases are accessible:');
    Object.entries(result.databases).forEach(([name, info]: [string, any]) => {
      logger.info(`  - ${name}: ✓ accessible`);
    });
    
    return true;
  } catch (error: any) {
    logger.error('Failed to validate Notion connection:', error.message);
    return false;
  }
}

async function previewDataStructure() {
  logger.info('\n=== Preview Data Structure ===');
  
  try {
    // Récupérer un échantillon de chaque base
    const samples = {
      tasks: await notionService.queryTrafficDatabase(undefined, 1),
      users: await notionService.queryUsersDatabase(undefined, 1),
      projects: await notionService.queryProjectsDatabase({}, undefined, 1),
      clients: await notionService.queryClientsDatabase(undefined, 1),
      teams: await notionService.queryTeamsDatabase(undefined, 1)
    };
    
    logger.info('\nSample data from each database:');
    
    for (const [type, data] of Object.entries(samples)) {
      if (data.results.length > 0) {
        const item = data.results[0];
        logger.info(`\n[${type.toUpperCase()}] Sample:`);
        logger.info(`  - ID: ${item.id}`);
        logger.info(`  - Title/Name: ${item.title || item.name}`);
        logger.info(`  - Properties: ${Object.keys(item).length} fields`);
      } else {
        logger.info(`\n[${type.toUpperCase()}] No data found`);
      }
    }
    
    return true;
  } catch (error: any) {
    logger.error('Failed to preview data structure:', error.message);
    return false;
  }
}

async function countNotionRecords() {
  logger.info('\n=== Counting Notion Records ===');
  
  try {
    const counts = {
      tasks: 0,
      users: 0,
      projects: 0,
      clients: 0,
      teams: 0
    };
    
    // Compter les enregistrements (première page seulement pour le placeholder)
    const taskData = await notionService.queryTrafficDatabase(undefined, 100);
    counts.tasks = taskData.results.length;
    
    const userData = await notionService.queryUsersDatabase(undefined, 100);
    counts.users = userData.results.length;
    
    const projectData = await notionService.queryProjectsDatabase({}, undefined, 100);
    counts.projects = projectData.results.length;
    
    const clientData = await notionService.queryClientsDatabase(undefined, 100);
    counts.clients = clientData.results.length;
    
    const teamData = await notionService.queryTeamsDatabase(undefined, 100);
    counts.teams = teamData.results.length;
    
    logger.info('\nRecord counts (first page):');
    logger.info(`  - Tasks: ${counts.tasks}${taskData.hasMore ? '+' : ''}`);
    logger.info(`  - Users: ${counts.users}${userData.hasMore ? '+' : ''}`);
    logger.info(`  - Projects: ${counts.projects}${projectData.hasMore ? '+' : ''}`);
    logger.info(`  - Clients: ${counts.clients}${clientData.hasMore ? '+' : ''}`);
    logger.info(`  - Teams: ${counts.teams}${teamData.hasMore ? '+' : ''}`);
    
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    logger.info(`\nTotal records to sync: ${total}+ (full count in Story 2.3)`);
    
    return true;
  } catch (error: any) {
    logger.error('Failed to count records:', error.message);
    return false;
  }
}

async function seedDatabase() {
  try {
    logger.info('╔══════════════════════════════════════════════════════╗');
    logger.info('║      Matter Traffic Database Seed Script (v1.0)       ║');
    logger.info('║                  PLACEHOLDER VERSION                   ║');
    logger.info('╚══════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info('⚠️  NOTE: This is a placeholder script');
    logger.info('Full synchronization will be implemented in Story 2.3');
    logger.info('');
    
    // 1. Connexion MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27018/matter-traffic';
    logger.info(`Connecting to MongoDB: ${mongoUri}`);
    await mongoose.connect(mongoUri);
    logger.info('✅ MongoDB connected');
    
    // 2. Valider la connexion Notion
    const notionValid = await validateNotionConnection();
    if (!notionValid) {
      throw new Error('Notion connection validation failed');
    }
    
    // 3. Prévisualiser la structure des données
    await previewDataStructure();
    
    // 4. Compter les enregistrements disponibles
    await countNotionRecords();
    
    // Résumé
    logger.info('\n╔══════════════════════════════════════════════════════╗');
    logger.info('║                     SEED SUMMARY                       ║');
    logger.info('╚══════════════════════════════════════════════════════╝');
    logger.info('✅ MongoDB connection established');
    logger.info('✅ Notion API connection validated');
    logger.info('✅ All 5 Notion databases accessible');
    logger.info('✅ Data structure previewed');
    logger.info('');
    logger.info('⚠️  IMPORTANT: Actual data synchronization will be');
    logger.info('   implemented in Story 2.3 with:');
    logger.info('   - Full pagination support');
    logger.info('   - Batch processing');
    logger.info('   - Conflict resolution');
    logger.info('   - Progress tracking');
    logger.info('   - Error recovery');
    logger.info('');
    logger.info('✅ Seed preparation completed successfully!');
    
    process.exit(0);
  } catch (error: any) {
    logger.error('\n❌ Seed script failed:', error.message);
    logger.error(error.stack);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      logger.info('\nDisconnected from MongoDB');
    }
  }
}

// Exécuter le script
seedDatabase();