/**
 * @deprecated This controller has been refactored into smaller modules.
 * Please use the specific controllers instead:
 * - task-read.controller.ts for read operations
 * - task-write.controller.ts for write operations
 * - task-conflict.controller.ts for conflict detection
 * - tasks-calendar.controller.ts for calendar operations
 * - tasks-batch.controller.ts for batch operations
 * - tasks-stats.controller.ts for statistics
 * 
 * This file will be removed in the next major version.
 */

import { taskReadController } from "./tasks/task-read.controller";
import { taskCreateController } from "./tasks/task-create.controller";
import { taskUpdateController } from "./tasks/task-update.controller";
import { taskDeleteController } from "./tasks/task-delete.controller";
import { tasksCalendarController } from "./tasks/tasks-calendar.controller";
import { tasksBatchController } from "./tasks/tasks-batch.controller";
import { tasksStatsController } from "./tasks/tasks-stats.controller";

/**
 * @deprecated Use individual controllers instead
 * This class now delegates to the refactored controllers for backward compatibility
 */
export class TasksController {
  // Delegate to tasks-calendar.controller.ts
  getCalendarTasks = tasksCalendarController.getCalendarTasks;

  // Delegate to task-read.controller.ts and individual write controllers
  getTaskById = taskReadController.getTaskById;
  getUnplannedTasks = taskReadController.getUnplannedTasks;
  createTask = taskCreateController.createTask;
  updateTask = taskUpdateController.updateTask;
  deleteTask = taskDeleteController.deleteTask;

  // Delegate to tasks-batch.controller.ts
  batchUpdateTasks = tasksBatchController.batchUpdateTasks;

  // Delegate to tasks-stats.controller.ts
  getTodayStats = tasksStatsController.getTodayStats;
  getUnplannedCount = tasksStatsController.getUnplannedCount;
}

export const tasksController = new TasksController();