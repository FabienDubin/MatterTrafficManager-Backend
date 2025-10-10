import mongoose from 'mongoose';
import { ConfigModel } from '../models/Config.model';
import logger from '../config/logger.config';
import dotenv from 'dotenv';

dotenv.config();

const ALL_CONFIGS = [
  // Sync configs
  {
    key: 'SYNC_INTERVAL_MINUTES',
    value: 15,
    description: 'Intervalle de synchronisation en minutes',
    category: 'sync',
    dataType: 'number',
    defaultValue: 15,
    validValues: [5, 10, 15, 30, 60],
    isEditable: true,
  },
  {
    key: 'MAX_SYNC_RETRIES',
    value: 3,
    description: 'Nombre maximum de tentatives de synchronisation',
    category: 'sync',
    dataType: 'number',
    defaultValue: 3,
    isEditable: true,
  },
  {
    key: 'ENABLE_AUTO_SYNC',
    value: true,
    description: 'Activer la synchronisation automatique',
    category: 'sync',
    dataType: 'boolean',
    defaultValue: true,
    isEditable: true,
  },
  {
    key: 'NOTION_RATE_LIMIT_PER_SECOND',
    value: 3,
    description: 'Nombre de requêtes Notion par seconde',
    category: 'sync',
    dataType: 'number',
    defaultValue: 3,
    isEditable: false,
  },
  {
    key: 'CONFLICT_RESOLUTION_STRATEGY',
    value: 'notion_wins',
    description: 'Stratégie de résolution des conflits',
    category: 'sync',
    dataType: 'string',
    defaultValue: 'notion_wins',
    validValues: ['notion_wins', 'local_wins', 'newest_wins', 'manual'],
    isEditable: true,
  },
  {
    key: 'ASYNC_MODE_CREATE',
    value: false,
    description: 'Activer le mode asynchrone pour la création de tâches',
    category: 'sync',
    dataType: 'boolean',
    defaultValue: false,
    isEditable: true,
  },
  {
    key: 'ASYNC_MODE_UPDATE',
    value: false,
    description: 'Activer le mode asynchrone pour la modification de tâches',
    category: 'sync',
    dataType: 'boolean',
    defaultValue: false,
    isEditable: true,
  },
  {
    key: 'ASYNC_MODE_DELETE',
    value: false,
    description: 'Activer le mode asynchrone pour la suppression de tâches',
    category: 'sync',
    dataType: 'boolean',
    defaultValue: false,
    isEditable: true,
  },
  // Cache config
  {
    key: 'CACHE_TTL_DAYS',
    value: 30,
    description: 'Durée de vie du cache en jours',
    category: 'cache',
    dataType: 'number',
    defaultValue: 30,
    isEditable: true,
  },
  // General configs
  {
    key: 'BATCH_SIZE',
    value: 100,
    description: 'Taille des lots pour les opérations batch',
    category: 'general',
    dataType: 'number',
    defaultValue: 100,
    isEditable: true,
  },
  {
    key: 'ENABLE_DEBUG_LOGS',
    value: false,
    description: 'Activer les logs de debug',
    category: 'general',
    dataType: 'boolean',
    defaultValue: false,
    isEditable: true,
  },
  {
    key: 'MAINTENANCE_MODE',
    value: false,
    description: 'Mode maintenance (bloque les syncs)',
    category: 'general',
    dataType: 'boolean',
    defaultValue: false,
    isEditable: true,
  },
  // Notification config
  {
    key: 'ENABLE_NOTIFICATIONS',
    value: true,
    description: 'Activer les notifications',
    category: 'notification',
    dataType: 'boolean',
    defaultValue: true,
    isEditable: true,
  },
  // Calendar configs (NEW)
  {
    key: 'TEAMS_DISPLAY_CONFIG',
    value: {
      teams: []
    },
    description: 'Configuration des équipes affichées dans le filtre du panneau latéral (4 max) - Format: [{ id, icon, color, order }]',
    category: 'calendar',
    dataType: 'json',
    defaultValue: {
      teams: []
    },
    isEditable: true,
  },
  {
    key: 'CALENDAR_DAY_VIEW_FIELDS',
    value: ['title', 'project', 'client'],
    description: 'Champs à afficher dans la vue jour',
    category: 'calendar',
    dataType: 'json',
    defaultValue: ['title', 'project', 'client'],
    isEditable: true,
  },
  {
    key: 'CALENDAR_WEEK_VIEW_FIELDS',
    value: ['title', 'member'],
    description: 'Champs à afficher dans la vue semaine',
    category: 'calendar',
    dataType: 'json',
    defaultValue: ['title', 'member'],
    isEditable: true,
  },
  {
    key: 'CALENDAR_MONTH_VIEW_FIELDS',
    value: ['title'],
    description: 'Champs à afficher dans la vue mois',
    category: 'calendar',
    dataType: 'json',
    defaultValue: ['title'],
    isEditable: true,
  },
  {
    key: 'CALENDAR_TITLE_MAX_LENGTH_DAY',
    value: 30,
    description: 'Longueur max du titre en vue jour',
    category: 'calendar',
    dataType: 'number',
    defaultValue: 30,
    isEditable: true,
  },
  {
    key: 'CALENDAR_TITLE_MAX_LENGTH_WEEK',
    value: 20,
    description: 'Longueur max du titre en vue semaine',
    category: 'calendar',
    dataType: 'number',
    defaultValue: 20,
    isEditable: true,
  },
  {
    key: 'CALENDAR_TITLE_MAX_LENGTH_MONTH',
    value: 15,
    description: 'Longueur max du titre en vue mois',
    category: 'calendar',
    dataType: 'number',
    defaultValue: 15,
    isEditable: true,
  },
  {
    key: 'SHOW_WEEKENDS',
    value: true,
    description: 'Afficher les weekends dans le calendrier',
    category: 'calendar',
    dataType: 'boolean',
    defaultValue: true,
    isEditable: true,
  },
  {
    key: 'SHOW_HOLIDAYS',
    value: true,
    description: 'Afficher les jours fériés français dans le calendrier',
    category: 'calendar',
    dataType: 'boolean',
    defaultValue: true,
    isEditable: true,
  },
  {
    key: 'TASK_STATUS_COLORS',
    value: {
      not_started: '#6b7280',
      in_progress: '#f59e0b',
      completed: '#10b981'
    },
    description: 'Couleurs d\'affichage des tâches par statut',
    category: 'calendar',
    dataType: 'json',
    defaultValue: {
      not_started: '#6b7280',
      in_progress: '#f59e0b',
      completed: '#10b981'
    },
    isEditable: true,
  },
];

async function initConfigs() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/matter-traffic';
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');

    let created = 0;
    let skipped = 0;

    // Add all configs
    for (const config of ALL_CONFIGS) {
      const exists = await ConfigModel.findOne({ key: config.key });
      
      if (!exists) {
        await ConfigModel.create(config);
        logger.info(`✅ Created config: ${config.key}`);
        created++;
      } else {
        logger.info(`⏭️  Config already exists: ${config.key}`);
        skipped++;
      }
    }

    logger.info(`\n📊 Summary: ${created} configs created, ${skipped} configs already existed`);
    
  } catch (error) {
    logger.error('Error initializing configs:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

// Run if executed directly
if (require.main === module) {
  console.log('🚀 Starting configuration initialization...\n');
  console.log(`📋 Will create/update ${ALL_CONFIGS.length} configurations\n`);
  
  initConfigs()
    .then(() => {
      console.log('\n✅ All configurations initialized successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

export default initConfigs;