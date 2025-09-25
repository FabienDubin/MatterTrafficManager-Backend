/**
 * @deprecated This controller has been refactored into smaller modules.
 * Please use the specific controllers instead:
 * - tasks-crud.controller.ts for CRUD operations
 * - tasks-calendar.controller.ts for calendar operations
 * - tasks-batch.controller.ts for batch operations
 * - tasks-stats.controller.ts for statistics
 * 
 * This file will be removed in the next major version.
 */

import { tasksCrudController } from "./tasks/tasks-crud.controller";
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

  // Delegate to tasks-crud.controller.ts
  getTaskById = tasksCrudController.getTaskById;
  createTask = tasksCrudController.createTask;
  updateTask = tasksCrudController.updateTask;
  deleteTask = tasksCrudController.deleteTask;

  // Delegate to tasks-batch.controller.ts
  batchUpdateTasks = tasksBatchController.batchUpdateTasks;

  // Delegate to tasks-stats.controller.ts
  getTodayStats = tasksStatsController.getTodayStats;
}

export const tasksController = new TasksController();