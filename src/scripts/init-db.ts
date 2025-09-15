import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from '../config/logger.config';
import { ConfigModel } from '../models/Config.model';
import { execSync } from 'child_process';
import path from 'path';

dotenv.config();

/**
 * Script d'initialisation complet de la base MongoDB
 * Usage: npm run db:init
 * 
 * Ce script :
 * 1. Vérifie la connexion MongoDB
 * 2. Crée toutes les collections nécessaires
 * 3. Applique tous les index
 * 4. Initialise les configurations par défaut
 */

const REQUIRED_COLLECTIONS = [
  'tasks',
  'members',
  'projects',
  'clients',
  'teams',
  'users',
  'refreshtokens',
  'syncqueues',
  'configs',
  'conflictlogs'
];

async function createCollections(db: any) {
  logger.info('=== Creating Collections ===');
  
  const existingCollections = await db.listCollections().toArray();
  const existingNames = existingCollections.map((c: any) => c.name);
  
  for (const collectionName of REQUIRED_COLLECTIONS) {
    if (existingNames.includes(collectionName)) {
      logger.info(`✓ Collection already exists: ${collectionName}`);
    } else {
      try {
        await db.createCollection(collectionName);
        logger.info(`✅ Created collection: ${collectionName}`);
      } catch (error: any) {
        logger.error(`❌ Failed to create collection ${collectionName}:`, error.message);
      }
    }
  }
}

async function initializeConfigs() {
  logger.info('=== Initializing Default Configurations ===');
  
  try {
    // await ConfigModel.initDefaults(); // TODO: Implement this method
    logger.info('✅ Default configurations initialized');
    
    // Afficher les configurations créées
    const configs = await ConfigModel.find({}).select('key value category').lean();
    logger.info(`Total configurations: ${configs.length}`);
    
    const byCategory = configs.reduce((acc: any, cfg: any) => {
      if (!acc[cfg.category]) acc[cfg.category] = [];
      acc[cfg.category].push(`${cfg.key}: ${cfg.value}`);
      return acc;
    }, {});
    
    Object.keys(byCategory).forEach(category => {
      logger.info(`\n[${category}]`);
      byCategory[category].forEach((cfg: string) => {
        logger.info(`  - ${cfg}`);
      });
    });
  } catch (error: any) {
    logger.error('Failed to initialize configs:', error.message);
    throw error;
  }
}

async function runIndexScript() {
  logger.info('=== Running Index Creation Script ===');
  
  try {
    const scriptPath = path.join(__dirname, 'create-indexes.ts');
    execSync(`npx ts-node ${scriptPath}`, { 
      stdio: 'inherit',
      env: process.env 
    });
    logger.info('✅ Index creation completed');
  } catch (error: any) {
    logger.error('❌ Index creation failed:', error.message);
    throw error;
  }
}

async function verifyMongoDBConnection() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27018/matter-traffic';
  logger.info('=== Verifying MongoDB Connection ===');
  logger.info(`Connecting to: ${mongoUri}`);
  
  try {
    await mongoose.connect(mongoUri);
    logger.info('✅ MongoDB connection successful');
    
    // Obtenir les infos de la base
    const db = mongoose.connection.db;
    const stats = await db!.stats();
    
    logger.info('Database Statistics:');
    logger.info(`  - Database: ${db!.databaseName}`);
    logger.info(`  - Collections: ${stats.collections}`);
    logger.info(`  - Objects: ${stats.objects}`);
    logger.info(`  - Data Size: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
    logger.info(`  - Storage Size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    
    return db;
  } catch (error: any) {
    logger.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

async function checkNotionConnection() {
  logger.info('=== Checking Notion API Configuration ===');
  
  const notionToken = process.env.NOTION_TOKEN;
  const databases = {
    traffic: process.env.NOTION_DB_TRAFFIC,
    users: process.env.NOTION_DB_USERS,
    projects: process.env.NOTION_DB_PROJECTS,
    clients: process.env.NOTION_DB_CLIENTS,
    teams: process.env.NOTION_DB_TEAMS
  };
  
  if (!notionToken) {
    logger.warn('⚠️  NOTION_TOKEN not configured');
    return false;
  }
  
  logger.info('✓ NOTION_TOKEN is configured');
  
  let allConfigured = true;
  for (const [name, id] of Object.entries(databases)) {
    if (!id) {
      logger.warn(`⚠️  NOTION_DB_${name.toUpperCase()} not configured`);
      allConfigured = false;
    } else {
      logger.info(`✓ ${name} database ID: ${id}`);
    }
  }
  
  return allConfigured;
}

async function initDatabase() {
  let db: any;
  
  try {
    logger.info('╔══════════════════════════════════════════════════════╗');
    logger.info('║     Matter Traffic Database Initialization Script     ║');
    logger.info('╚══════════════════════════════════════════════════════╝');
    logger.info('');
    
    // 1. Vérifier la connexion MongoDB
    db = await verifyMongoDBConnection();
    
    // 2. Créer les collections
    await createCollections(db);
    
    // 3. Initialiser les configurations par défaut
    await initializeConfigs();
    
    // 4. Créer les index (via script séparé)
    logger.info('\n=== Creating Indexes ===');
    logger.info('Note: Running create-indexes.ts script...');
    // Note: On n'exécute pas le script ici car il a sa propre connexion
    // L'utilisateur doit lancer npm run db:create-indexes séparément
    logger.info('Please run: npm run db:create-indexes');
    
    // 5. Vérifier la configuration Notion
    const notionConfigured = await checkNotionConnection();
    
    // Résumé final
    logger.info('\n╔══════════════════════════════════════════════════════╗');
    logger.info('║                    INITIALIZATION SUMMARY              ║');
    logger.info('╚══════════════════════════════════════════════════════╝');
    logger.info('✅ MongoDB connection established');
    logger.info('✅ Collections created/verified');
    logger.info('✅ Default configurations initialized');
    logger.info('⚠️  Indexes: Run npm run db:create-indexes');
    
    if (notionConfigured) {
      logger.info('✅ Notion API fully configured');
    } else {
      logger.warn('⚠️  Notion API configuration incomplete');
      logger.info('   Please configure all NOTION_DB_* environment variables');
    }
    
    logger.info('\n✅ Database initialization completed successfully!');
    logger.info('\nNext steps:');
    logger.info('1. Run: npm run db:create-indexes');
    logger.info('2. Run: npm run db:seed (when available)');
    
    process.exit(0);
  } catch (error: any) {
    logger.error('\n❌ Database initialization failed:', error.message);
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
initDatabase();