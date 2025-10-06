import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';
import { NotionConfigModel } from '../models/NotionConfig.model';
import { UserModel } from '../models/User.model';
import logger from '../config/logger.config';

dotenv.config();

/**
 * Interactive script to update Notion production configuration
 * Prompts for:
 * - Notion token (optional, encrypted and stored)
 * - Database IDs for each entity (teams, users, clients, projects, traffic)
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function updateNotionConfigProd() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27018/matter-traffic-prod';
    await mongoose.connect(mongoUri);
    logger.info('✅ Connected to MongoDB');

    const environment = process.env.NODE_ENV || 'production';
    logger.info(`📝 Environment: ${environment}`);

    // Find existing config or prepare to create one
    let config = await NotionConfigModel.findOne({ environment }).select('+notionToken');

    if (!config) {
      logger.info('⚠️  No config found for this environment. Creating a new one...');

      // Find an admin user to assign as creator
      const adminUser = await UserModel.findOne({ role: 'admin' });
      if (!adminUser) {
        throw new Error('No admin user found. Please create an admin user first.');
      }

      config = new NotionConfigModel({
        environment,
        isActive: true,
        autoDetectEnabled: true,
        createdBy: adminUser._id,
        updatedBy: adminUser._id,
        databases: {
          teams: { id: '', name: 'Teams' },
          users: { id: '', name: 'Users' },
          clients: { id: '', name: 'Clients' },
          projects: { id: '', name: 'Projects' },
          traffic: { id: '', name: 'Traffic' }
        },
        mappings: [],
        relationships: [],
        version: 1,
        auditLog: []
      });
    } else {
      logger.info('✅ Existing config found');
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║    Update Notion Production Configuration                 ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // Ask if user wants to update the token
    const updateToken = await question('Mettre à jour le token Notion ? (y/N): ');

    if (updateToken.toLowerCase() === 'y') {
      const newToken = await question('Nouveau token Notion (secret_XXX ou ntn_XXX): ');
      if (newToken && (newToken.startsWith('secret_') || newToken.startsWith('ntn_'))) {
        // Encrypt and store the token
        config.notionToken = (config as any).encryptToken(newToken);
        logger.info('✅ Token crypté et sauvegardé');
      } else if (newToken) {
        logger.warn('⚠️  Token invalide (doit commencer par secret_ ou ntn_). Token non modifié.');
      }
    }

    console.log('\n📋 Entrez les IDs des databases Notion de production:');
    console.log('(Laissez vide pour garder la valeur actuelle)\n');

    // Update each database ID
    const databases = ['teams', 'users', 'clients', 'projects', 'traffic'];
    const databaseLabels: Record<string, string> = {
      teams: 'Équipes',
      users: 'Utilisateurs',
      clients: 'Clients',
      projects: 'Projets',
      traffic: 'Trafic'
    };

    for (const dbName of databases) {
      const dbKey = dbName as 'teams' | 'users' | 'clients' | 'projects' | 'traffic';
      const currentId = config.databases[dbKey].id;
      const displayId = currentId || '(non défini)';

      const newId = await question(
        `${databaseLabels[dbName]} [${displayId}]: `
      );

      if (newId) {
        // Remove any dashes or formatting from the ID
        const cleanId = newId.replace(/-/g, '');
        config.databases[dbKey].id = cleanId;
        logger.info(`  ✓ ${databaseLabels[dbName]}: ${cleanId}`);
      } else if (currentId) {
        logger.info(`  → ${databaseLabels[dbName]}: ${currentId} (inchangé)`);
      }
    }

    // Update audit log
    const adminUser = await UserModel.findOne({ role: 'admin' });
    if (adminUser) {
      config.updatedBy = adminUser._id as any;
      (config as any).addAuditEntry(
        adminUser._id,
        'UPDATE_CONFIG_PROD_SCRIPT',
        {
          databases: config.databases,
          tokenUpdated: updateToken.toLowerCase() === 'y'
        }
      );
    }

    // Save the configuration
    await config.save();

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                   ✅ Configuration sauvegardée             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('Configuration mise à jour:');
    console.log(`  Environment: ${config.environment}`);
    console.log(`  Token configuré: ${config.notionToken ? 'Oui (crypté)' : 'Non'}`);
    console.log(`  Databases:`);
    databases.forEach(dbName => {
      const dbKey = dbName as 'teams' | 'users' | 'clients' | 'projects' | 'traffic';
      const db = config!.databases[dbKey];
      console.log(`    - ${databaseLabels[dbName]}: ${db.id || '(non défini)'}`);
    });

    console.log('\n✨ Tu peux maintenant tester la connexion depuis l\'interface admin!\n');

    rl.close();
    await mongoose.disconnect();
    process.exit(0);

  } catch (error: any) {
    logger.error('❌ Error updating Notion config:', error.message);
    console.error(error);
    rl.close();
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
updateNotionConfigProd();
