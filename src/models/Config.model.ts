import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Interface TypeScript pour Config (configuration système)
 */
export interface IConfig extends Document {
  id: string;
  key: string; // Clé unique de configuration
  value: any; // Valeur de configuration (flexible)
  description?: string; // Description de la configuration
  category: "sync" | "cache" | "notification" | "general" | "calendar";
  isEditable: boolean; // Si modifiable depuis l'UI admin
  dataType: "string" | "number" | "boolean" | "json" | "array";
  defaultValue?: any;
  validValues?: any[]; // Valeurs possibles pour les enums
  lastModifiedBy?: string; // User qui a modifié
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface pour les méthodes statiques du modèle Config
 */
export interface IConfigModel extends Model<IConfig> {
  getValue(key: string): Promise<any>;
  setValue(key: string, value: any, userId?: string): Promise<IConfig>;
  getByCategory(category: string): Promise<IConfig[]>;
  initDefaults(): Promise<void>;
}

/**
 * Schéma Mongoose pour Config
 */
const ConfigSchema: Schema = new Schema(
  {
    key: {
      type: String,
      required: [true, 'Config key is required'],
      unique: true,
      index: true,
      trim: true,
      match: [
        /^[A-Z_]+$/,
        'Config key must be uppercase with underscores only'
      ],
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    category: {
      type: String,
      enum: ['sync', 'cache', 'notification', 'general', 'calendar'],
      default: 'general',
      required: true,
      index: true,
    },
    isEditable: {
      type: Boolean,
      default: true,
      required: true,
    },
    dataType: {
      type: String,
      enum: ['string', 'number', 'boolean', 'json', 'array'],
      default: 'string',
      required: true,
    },
    defaultValue: {
      type: Schema.Types.Mixed,
    },
    validValues: [{
      type: Schema.Types.Mixed,
    }],
    lastModifiedBy: {
      type: String,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index pour recherche par catégorie
ConfigSchema.index({ category: 1 });

// Validation de la valeur selon le type
ConfigSchema.pre<IConfig>('save', function (next) {
  // Valider le type de données
  switch (this.dataType) {
    case 'number':
      if (typeof this.value !== 'number') {
        next(new Error(`Value must be a number for key ${this.key}`));
        return;
      }
      break;
    case 'boolean':
      if (typeof this.value !== 'boolean') {
        next(new Error(`Value must be a boolean for key ${this.key}`));
        return;
      }
      break;
    case 'array':
      if (!Array.isArray(this.value)) {
        next(new Error(`Value must be an array for key ${this.key}`));
        return;
      }
      break;
    case 'json':
      if (typeof this.value !== 'object' || this.value === null) {
        next(new Error(`Value must be a JSON object for key ${this.key}`));
        return;
      }
      break;
  }
  
  // Valider contre les valeurs possibles si définies
  if (this.validValues && this.validValues.length > 0) {
    if (!this.validValues.includes(this.value)) {
      next(new Error(`Value must be one of: ${this.validValues.join(', ')}`));
      return;
    }
  }
  
  next();
});

/**
 * Méthode statique pour obtenir une configuration
 */
ConfigSchema.statics.getValue = async function(key: string): Promise<any> {
  const config = await this.findOne({ key });
  return config ? config.value : null;
};

/**
 * Méthode statique pour définir une configuration
 */
ConfigSchema.statics.setValue = async function(
  key: string,
  value: any,
  userId?: string
): Promise<IConfig> {
  return this.findOneAndUpdate(
    { key },
    { 
      value,
      lastModifiedBy: userId 
    },
    { 
      new: true,
      runValidators: true
    }
  );
};

/**
 * Méthode statique pour obtenir toutes les configs d'une catégorie
 */
ConfigSchema.statics.getByCategory = function(category: string) {
  return this.find({ category });
};

/**
 * Méthode statique pour initialiser les configurations par défaut
 */
ConfigSchema.statics.initDefaults = async function(): Promise<void> {
  const defaultConfigs = [
    {
      key: 'SYNC_INTERVAL_MINUTES',
      value: 15,
      description: 'Intervalle de synchronisation en minutes',
      category: 'sync',
      dataType: 'number',
      defaultValue: 15,
      validValues: [5, 10, 15, 30, 60],
    },
    {
      key: 'CACHE_TTL_DAYS',
      value: 30,
      description: 'Durée de vie du cache en jours',
      category: 'cache',
      dataType: 'number',
      defaultValue: 30,
    },
    {
      key: 'MAX_SYNC_RETRIES',
      value: 3,
      description: 'Nombre maximum de tentatives de synchronisation',
      category: 'sync',
      dataType: 'number',
      defaultValue: 3,
    },
    {
      key: 'ENABLE_AUTO_SYNC',
      value: true,
      description: 'Activer la synchronisation automatique',
      category: 'sync',
      dataType: 'boolean',
      defaultValue: true,
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
      key: 'BATCH_SIZE',
      value: 100,
      description: 'Taille des lots pour les opérations batch',
      category: 'general',
      dataType: 'number',
      defaultValue: 100,
    },
    {
      key: 'ENABLE_NOTIFICATIONS',
      value: true,
      description: 'Activer les notifications',
      category: 'notification',
      dataType: 'boolean',
      defaultValue: true,
    },
    {
      key: 'CONFLICT_RESOLUTION_STRATEGY',
      value: 'notion_wins',
      description: 'Stratégie de résolution des conflits',
      category: 'sync',
      dataType: 'string',
      defaultValue: 'notion_wins',
      validValues: ['notion_wins', 'local_wins', 'newest_wins', 'manual'],
    },
    {
      key: 'ENABLE_DEBUG_LOGS',
      value: false,
      description: 'Activer les logs de debug',
      category: 'general',
      dataType: 'boolean',
      defaultValue: false,
    },
    // Calendar configuration
    {
      key: 'CALENDAR_DAY_VIEW_FIELDS',
      value: JSON.stringify(['title', 'project', 'client']),
      description: 'Champs à afficher dans la vue jour',
      category: 'calendar',
      dataType: 'json',
      defaultValue: JSON.stringify(['title', 'project', 'client']),
      isEditable: true,
    },
    {
      key: 'CALENDAR_WEEK_VIEW_FIELDS',
      value: JSON.stringify(['title', 'member']),
      description: 'Champs à afficher dans la vue semaine',
      category: 'calendar',
      dataType: 'json',
      defaultValue: JSON.stringify(['title', 'member']),
      isEditable: true,
    },
    {
      key: 'CALENDAR_MONTH_VIEW_FIELDS',
      value: JSON.stringify(['title']),
      description: 'Champs à afficher dans la vue mois',
      category: 'calendar',
      dataType: 'json',
      defaultValue: JSON.stringify(['title']),
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
      key: 'MAINTENANCE_MODE',
      value: false,
      description: 'Mode maintenance (bloque les syncs)',
      category: 'general',
      dataType: 'boolean',
      defaultValue: false,
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
  ];
  
  for (const config of defaultConfigs) {
    await this.findOneAndUpdate(
      { key: config.key },
      config,
      { upsert: true, new: true }
    );
  }
};

export const ConfigModel = mongoose.model<IConfig, IConfigModel>('Config', ConfigSchema);