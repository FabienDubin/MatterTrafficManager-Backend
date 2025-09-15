import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from '../config/logger.config';

dotenv.config();

/**
 * Script pour créer tous les index MongoDB nécessaires
 * Usage: npm run db:create-indexes
 */

interface IndexConfig {
  collection: string;
  indexes: Array<{
    fields: any;
    options?: any;
    description: string;
  }>;
}

const indexConfigs: IndexConfig[] = [
  {
    collection: 'tasks',
    indexes: [
      {
        fields: { notionId: 1 },
        options: { unique: true },
        description: 'Index unique sur notionId'
      },
      {
        fields: { projectId: 1 },
        description: 'Index sur projectId pour recherche par projet'
      },
      {
        fields: { assignedMembers: 1 },
        description: 'Index sur assignedMembers pour recherche par membre'
      },
      {
        fields: { 'workPeriod.startDate': 1, 'workPeriod.endDate': 1 },
        description: 'Index composé sur période de travail'
      },
      {
        fields: { status: 1 },
        description: 'Index sur status pour filtrage'
      },
      {
        fields: { clientId: 1 },
        description: 'Index sur clientId pour recherche par client'
      },
      {
        fields: { assignedMembers: 1, status: 1 },
        description: 'Index composé pour recherche membres + status'
      },
      {
        fields: { projectId: 1, status: 1 },
        description: 'Index composé pour recherche projet + status'
      },
      {
        fields: { googleEventId: 1 },
        options: { sparse: true },
        description: 'Index sparse sur googleEventId pour sync Google Calendar'
      },
      {
        fields: { _ttl: 1 },
        options: { expireAfterSeconds: 0 },
        description: 'Index TTL pour expiration automatique'
      }
    ]
  },
  {
    collection: 'members',
    indexes: [
      {
        fields: { notionId: 1 },
        options: { unique: true },
        description: 'Index unique sur notionId'
      },
      {
        fields: { email: 1 },
        description: 'Index sur email pour recherche'
      },
      {
        fields: { teamIds: 1 },
        description: 'Index sur teamIds pour recherche par équipe'
      },
      {
        fields: { teamIds: 1, isActive: 1 },
        description: 'Index composé équipe + statut actif'
      },
      {
        fields: { managerId: 1 },
        description: 'Index sur managerId pour recherche par manager'
      },
      {
        fields: { notionUserId: 1 },
        options: { sparse: true },
        description: 'Index sparse sur notionUserId'
      },
      {
        fields: { isActive: 1 },
        description: 'Index sur isActive pour filtrage membres actifs'
      }
    ]
  },
  {
    collection: 'projects',
    indexes: [
      {
        fields: { notionId: 1 },
        options: { unique: true },
        description: 'Index unique sur notionId'
      },
      {
        fields: { clientId: 1 },
        description: 'Index sur clientId pour recherche par client'
      },
      {
        fields: { status: 1 },
        description: 'Index sur status pour filtrage'
      },
      {
        fields: { status: 1, clientId: 1 },
        description: 'Index composé status + client'
      },
      {
        fields: { teamIds: 1 },
        description: 'Index sur teamIds pour recherche par équipe'
      },
      {
        fields: { projectLeadId: 1 },
        description: 'Index sur projectLeadId pour recherche par chef de projet'
      },
      {
        fields: { startDate: 1, endDate: 1 },
        description: 'Index composé sur dates du projet'
      },
      {
        fields: { _ttl: 1 },
        options: { expireAfterSeconds: 0 },
        description: 'Index TTL pour expiration automatique'
      }
    ]
  },
  {
    collection: 'clients',
    indexes: [
      {
        fields: { notionId: 1 },
        options: { unique: true },
        description: 'Index unique sur notionId'
      },
      {
        fields: { status: 1 },
        description: 'Index sur status pour filtrage'
      },
      {
        fields: { types: 1 },
        description: 'Index sur types pour recherche par type'
      },
      {
        fields: { primaryContactEmail: 1 },
        description: 'Index sur email de contact principal'
      },
      {
        fields: { _ttl: 1 },
        options: { expireAfterSeconds: 0 },
        description: 'Index TTL pour expiration automatique'
      }
    ]
  },
  {
    collection: 'teams',
    indexes: [
      {
        fields: { notionId: 1 },
        options: { unique: true },
        description: 'Index unique sur notionId'
      },
      {
        fields: { managerId: 1 },
        description: 'Index sur managerId pour recherche par manager'
      },
      {
        fields: { displayOrder: 1 },
        description: 'Index sur displayOrder pour tri'
      },
      {
        fields: { _ttl: 1 },
        options: { expireAfterSeconds: 0 },
        description: 'Index TTL pour expiration automatique'
      }
    ]
  },
  {
    collection: 'syncqueues',
    indexes: [
      {
        fields: { status: 1, priority: 1, createdAt: 1 },
        description: 'Index composé pour récupération optimale des tâches'
      },
      {
        fields: { status: 1, nextRetryAt: 1 },
        description: 'Index pour gestion des retries'
      },
      {
        fields: { entityType: 1, entityId: 1 },
        description: 'Index pour recherche par entité'
      },
      {
        fields: { notionId: 1 },
        description: 'Index sur notionId'
      },
      {
        fields: { processedAt: 1 },
        options: { 
          expireAfterSeconds: 7 * 24 * 60 * 60,
          partialFilterExpression: { status: 'completed' }
        },
        description: 'Index TTL pour suppression auto des tâches complétées après 7 jours'
      }
    ]
  },
  {
    collection: 'configs',
    indexes: [
      {
        fields: { key: 1 },
        options: { unique: true },
        description: 'Index unique sur key de configuration'
      },
      {
        fields: { category: 1 },
        description: 'Index sur category pour regroupement'
      }
    ]
  },
  {
    collection: 'conflictlogs',
    indexes: [
      {
        fields: { entityType: 1, entityId: 1, detectedAt: -1 },
        description: 'Index pour recherche par entité'
      },
      {
        fields: { resolution: 1, severity: 1, detectedAt: -1 },
        description: 'Index pour conflits non résolus par sévérité'
      },
      {
        fields: { notionId: 1 },
        description: 'Index sur notionId'
      },
      {
        fields: { conflictType: 1 },
        description: 'Index sur type de conflit'
      },
      {
        fields: { detectedAt: -1 },
        description: 'Index pour tri par date de détection'
      },
      {
        fields: { resolvedAt: 1 },
        options: { 
          expireAfterSeconds: 90 * 24 * 60 * 60,
          partialFilterExpression: { resolution: { $ne: 'pending' } }
        },
        description: 'Index TTL pour suppression auto des conflits résolus après 90 jours'
      }
    ]
  }
];

async function createIndexes() {
  try {
    // Connection MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27018/matter-traffic';
    logger.info('Connecting to MongoDB...', { uri: mongoUri });
    
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');

    const db = mongoose.connection.db;
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    // Créer les index pour chaque collection
    for (const config of indexConfigs) {
      logger.info(`\n=== Processing collection: ${config.collection} ===`);
      const collection = db!.collection(config.collection);

      // Récupérer les index existants
      const existingIndexes = await collection.listIndexes().toArray();
      const existingIndexNames = existingIndexes.map(idx => idx.name);

      for (const indexDef of config.indexes) {
        try {
          // Générer un nom d'index basé sur les champs
          const indexName = Object.keys(indexDef.fields)
            .map(key => `${key}_${indexDef.fields[key]}`)
            .join('_');

          // Vérifier si l'index existe déjà
          if (existingIndexNames.includes(indexName)) {
            logger.info(`⏭️  Index already exists: ${indexName} - ${indexDef.description}`);
            totalSkipped++;
            continue;
          }

          // Créer l'index
          await collection.createIndex(indexDef.fields, {
            ...indexDef.options,
            name: indexName,
            background: true // Création en arrière-plan pour ne pas bloquer
          });

          logger.info(`✅ Created index: ${indexName} - ${indexDef.description}`);
          totalCreated++;
        } catch (error: any) {
          logger.error(`❌ Failed to create index: ${indexDef.description}`, {
            error: error.message
          });
          totalFailed++;
        }
      }
    }

    // Résumé
    logger.info('\n=== Index Creation Summary ===');
    logger.info(`✅ Created: ${totalCreated} indexes`);
    logger.info(`⏭️  Skipped: ${totalSkipped} indexes (already exist)`);
    if (totalFailed > 0) {
      logger.error(`❌ Failed: ${totalFailed} indexes`);
    }

    // Lister tous les index créés par collection
    logger.info('\n=== Current Indexes by Collection ===');
    for (const config of indexConfigs) {
      const collection = db!.collection(config.collection);
      const indexes = await collection.listIndexes().toArray();
      logger.info(`\n${config.collection}: ${indexes.length} indexes`);
      indexes.forEach(idx => {
        logger.info(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
      });
    }

    logger.info('\n✅ Index creation script completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to create indexes', { error });
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Exécuter le script
createIndexes();