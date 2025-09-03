import mongoose, { Schema, Document } from 'mongoose';

// Interface TypeScript pour la tâche
export interface ITask extends Document {
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  projectId: mongoose.Types.ObjectId;
  assigneeId?: mongoose.Types.ObjectId;
  notionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Schéma Mongoose pour la tâche
const TaskSchema: Schema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Le titre de la tâche est obligatoire'],
      trim: true,
      maxlength: [200, 'Le titre ne peut pas dépasser 200 caractères'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'La description ne peut pas dépasser 2000 caractères'],
    },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'done'],
      default: 'todo',
      required: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
      required: true,
    },
    dueDate: {
      type: Date,
      validate: {
        validator: function (date: Date) {
          return date > new Date();
        },
        message: 'La date d\'échéance doit être dans le futur',
      },
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'L\'ID du projet est obligatoire'],
    },
    assigneeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    notionId: {
      type: String,
      unique: true,
      sparse: true, // Permet des valeurs nulles uniques
    },
  },
  {
    timestamps: true, // Ajoute automatiquement createdAt et updatedAt
    versionKey: false,
  }
);

// Index pour optimiser les requêtes
TaskSchema.index({ projectId: 1, status: 1 });
TaskSchema.index({ dueDate: 1 });
TaskSchema.index({ createdAt: -1 });
TaskSchema.index({ notionId: 1 }, { sparse: true });

// Méthode d'instance pour marquer comme terminée
TaskSchema.methods.markAsCompleted = function (): Promise<ITask> {
  this.status = 'done';
  return this.save();
};

// Méthode statique pour trouver les tâches en retard
TaskSchema.statics.findOverdue = function () {
  return this.find({
    dueDate: { $lt: new Date() },
    status: { $ne: 'done' },
  });
};

// Middleware pre-save pour la validation
TaskSchema.pre<ITask>('save', function (next) {
  // Validation personnalisée si nécessaire
  next();
});

export const Task = mongoose.model<ITask>('Task', TaskSchema);