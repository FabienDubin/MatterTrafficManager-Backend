import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface TypeScript pour Task (cache Notion)
 */
export interface ITask extends Document {
  id: string;
  notionId: string; // Unique, indexed
  title: string;
  workPeriod: {
    startDate: Date;
    endDate: Date;
  };
  assignedMembers: string[]; // Member IDs
  projectId: string;
  clientId?: string;
  status: "not_started" | "in_progress" | "completed";
  taskType: "task" | "holiday" | "school" | "remote";
  notes?: string;
  billedHours?: number;
  actualHours?: number;
  addToCalendar?: boolean;
  addToClientPlanning?: boolean;
  googleEventId?: string; // Pour sync Google Calendar
  // Metadata
  lastNotionSync: Date;
  lastModifiedInNotion?: Date; // Date de dernière modif dans Notion
  syncedAt?: Date; // Date de dernière sync
  _ttl: Date; // Pour expiration automatique
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schéma Mongoose pour Task avec TTL automatique
 */
const TaskSchema: Schema = new Schema(
  {
    notionId: {
      type: String,
      required: [true, 'Notion ID is required'],
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [500, 'Title cannot exceed 500 characters'],
    },
    workPeriod: {
      startDate: {
        type: Date,
        required: [true, 'Work period start date is required'],
      },
      endDate: {
        type: Date,
        required: [true, 'Work period end date is required'],
        validate: {
          validator: function(this: ITask, endDate: Date) {
            return endDate >= this.workPeriod.startDate;
          },
          message: 'End date must be after or equal to start date'
        }
      },
    },
    assignedMembers: [{
      type: String,
      required: true,
    }],
    projectId: {
      type: String,
      required: [true, 'Project ID is required'],
      index: true,
    },
    clientId: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
      required: true,
      index: true,
    },
    taskType: {
      type: String,
      enum: ['task', 'holiday', 'school', 'remote'],
      default: 'task',
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
    billedHours: {
      type: Number,
      min: [0, 'Billed hours cannot be negative'],
      max: [1000, 'Billed hours cannot exceed 1000'],
    },
    actualHours: {
      type: Number,
      min: [0, 'Actual hours cannot be negative'],
      max: [1000, 'Actual hours cannot exceed 1000'],
    },
    addToCalendar: {
      type: Boolean,
      default: false,
    },
    addToClientPlanning: {
      type: Boolean,
      default: false,
    },
    googleEventId: {
      type: String,
      sparse: true, // Index sparse pour optimiser les requêtes
      index: true,
    },
    lastNotionSync: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastModifiedInNotion: {
      type: Date,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
    _ttl: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 jours
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index TTL pour expiration automatique
TaskSchema.index({ _ttl: 1 }, { expireAfterSeconds: 0 });

// Index composé pour optimiser les requêtes par période de travail
TaskSchema.index({ 
  'workPeriod.startDate': 1, 
  'workPeriod.endDate': 1 
});

// Index composé pour recherche par membres assignés
TaskSchema.index({ assignedMembers: 1, status: 1 });

// Index pour recherche par projet et status
TaskSchema.index({ projectId: 1, status: 1 });

// Index pour recherche par client
TaskSchema.index({ clientId: 1 });

/**
 * Méthode d'instance pour marquer comme terminée
 */
TaskSchema.methods.markAsCompleted = function(): Promise<ITask> {
  this.status = 'completed';
  return this.save();
};

/**
 * Méthode statique pour trouver les tâches par période
 */
TaskSchema.statics.findByDateRange = function(startDate: Date, endDate: Date) {
  return this.find({
    $or: [
      {
        'workPeriod.startDate': { $gte: startDate, $lte: endDate }
      },
      {
        'workPeriod.endDate': { $gte: startDate, $lte: endDate }
      },
      {
        'workPeriod.startDate': { $lte: startDate },
        'workPeriod.endDate': { $gte: endDate }
      }
    ]
  });
};

/**
 * Méthode statique pour trouver par membre assigné
 */
TaskSchema.statics.findByAssignedMember = function(memberId: string) {
  return this.find({ assignedMembers: memberId });
};

/**
 * Méthode statique pour synchronisation depuis Notion
 */
TaskSchema.statics.upsertFromNotion = async function(notionData: any): Promise<ITask> {
  const filter = { notionId: notionData.notionId };
  const update = {
    ...notionData,
    lastNotionSync: new Date(),
    _ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Reset TTL
  };
  
  return this.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    runValidators: true,
  });
};

/**
 * Middleware pre-save pour validation
 */
TaskSchema.pre<ITask>('save', function (next) {
  // Vérifier que la période de travail est cohérente
  if (this.workPeriod.endDate < this.workPeriod.startDate) {
    next(new Error('End date cannot be before start date'));
    return;
  }
  
  // Mise à jour du TTL à chaque sauvegarde
  if (!this._ttl) {
    this._ttl = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  
  next();
});

export const TaskModel = mongoose.model<ITask>('Task', TaskSchema);