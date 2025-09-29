import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface for scheduling conflicts (overlap, holiday, school, overload)
 * These are different from sync conflicts - they represent planning issues
 */
export interface ITaskSchedulingConflict extends Document {
  taskId: string; // Notion ID of the task
  type: 'overlap' | 'holiday' | 'school' | 'overload';
  severity: 'low' | 'medium' | 'high';
  message: string;
  memberId: string;
  memberName?: string;
  conflictingTaskId?: string;
  conflictingTaskTitle?: string;
  status: 'active' | 'resolved' | 'ignored';
  detectedAt: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for the model with static methods
 */
export interface ITaskSchedulingConflictModel extends mongoose.Model<ITaskSchedulingConflict> {
  findActiveForTasks(taskIds: string[]): Promise<ITaskSchedulingConflict[]>;
  resolveForTask(taskId: string): Promise<any>;
  deleteForTask(taskId: string): Promise<any>;
  bulkSaveConflicts(taskId: string, conflicts: any[]): Promise<ITaskSchedulingConflict[]>;
}

/**
 * Mongoose schema for task scheduling conflicts
 */
const TaskSchedulingConflictSchema: Schema = new Schema(
  {
    taskId: {
      type: String,
      required: [true, 'Task ID is required'],
      index: true,
    },
    type: {
      type: String,
      enum: ['overlap', 'holiday', 'school', 'overload'],
      required: [true, 'Conflict type is required'],
      index: true,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      required: [true, 'Severity is required'],
      index: true,
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      maxlength: [500, 'Message cannot exceed 500 characters'],
    },
    memberId: {
      type: String,
      required: [true, 'Member ID is required'],
      index: true,
    },
    memberName: {
      type: String,
      trim: true,
    },
    conflictingTaskId: {
      type: String,
      index: true,
    },
    conflictingTaskTitle: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'resolved', 'ignored'],
      default: 'active',
      required: true,
      index: true,
    },
    detectedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound index for efficient queries
TaskSchedulingConflictSchema.index({ taskId: 1, status: 1 });
TaskSchedulingConflictSchema.index({ status: 1, detectedAt: -1 });
TaskSchedulingConflictSchema.index({ memberId: 1, status: 1, detectedAt: -1 });

// No TTL index needed since we delete conflicts immediately when resolved

/**
 * Static method to find active conflicts for tasks
 */
TaskSchedulingConflictSchema.statics.findActiveForTasks = function(taskIds: string[]) {
  return this.find({
    taskId: { $in: taskIds },
    status: 'active'
  });
};

/**
 * Static method to resolve all conflicts for a task
 */
TaskSchedulingConflictSchema.statics.resolveForTask = function(taskId: string) {
  return this.updateMany(
    { taskId, status: 'active' },
    { 
      status: 'resolved',
      resolvedAt: new Date()
    }
  );
};

/**
 * Static method to delete all conflicts for a task
 */
TaskSchedulingConflictSchema.statics.deleteForTask = function(taskId: string) {
  return this.deleteMany({ taskId });
};

/**
 * Static method to bulk save conflicts
 */
TaskSchedulingConflictSchema.statics.bulkSaveConflicts = async function(
  taskId: string, 
  conflicts: any[]
) {
  // First, mark existing conflicts as resolved
  await this.updateMany(
    { taskId, status: 'active' },
    { 
      status: 'resolved',
      resolvedAt: new Date()
    }
  );
  
  // Then create new active conflicts
  if (conflicts.length > 0) {
    const docs = conflicts.map(conflict => ({
      taskId,
      ...conflict,
      status: 'active',
      detectedAt: new Date()
    }));
    
    return this.insertMany(docs);
  }
  
  return [];
};

export const TaskSchedulingConflictModel = mongoose.model<ITaskSchedulingConflict, ITaskSchedulingConflictModel>(
  'TaskSchedulingConflict',
  TaskSchedulingConflictSchema
);