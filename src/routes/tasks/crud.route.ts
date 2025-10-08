import { Router } from "express";
import { taskReadController } from "../../controllers/tasks/task-read.controller";
import { taskCreateController } from "../../controllers/tasks/task-create.controller";
import { taskUpdateController } from "../../controllers/tasks/task-update.controller";
import { taskDeleteController } from "../../controllers/tasks/task-delete.controller";
import { taskConflictController } from "../../controllers/tasks/task-conflict.controller";
import { authenticate, requireManagerOrAbove } from "../../middleware/auth.middleware";

const router = Router();

/**
 * CRUD Routes for Tasks
 */

/**
 * @swagger
 * /api/v1/tasks/{id}:
 *   get:
 *     summary: Get a single task by ID
 *     description: Retrieve detailed information about a specific task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *         example: "12a34b5c-6789-0def-ghij-klmnopqrstuv"
 *     responses:
 *       200:
 *         description: Task retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     workPeriod:
 *                       type: object
 *                     status:
 *                       type: string
 *                       enum: [not_started, in_progress, completed]
 *                     syncStatus:
 *                       type: object
 *       404:
 *         description: Task not found
 *       500:
 *         description: Server error
 */
router.get(
  "/:id",
  authenticate,
  taskReadController.getTaskById
);

/**
 * @swagger
 * /api/v1/tasks:
 *   post:
 *     summary: Create a new task
 *     description: Create a new task in the system with optional async mode
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: async
 *         schema:
 *           type: boolean
 *         description: Use async mode for optimistic updates
 *         example: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - workPeriod
 *             properties:
 *               title:
 *                 type: string
 *                 description: Task title
 *                 example: "Développement feature X"
 *               workPeriod:
 *                 type: object
 *                 required:
 *                   - startDate
 *                   - endDate
 *                 properties:
 *                   startDate:
 *                     type: string
 *                     format: date
 *                     example: "2025-01-15"
 *                   endDate:
 *                     type: string
 *                     format: date
 *                     example: "2025-01-20"
 *               assignedMembers:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["user-123", "user-456"]
 *               projectId:
 *                 type: string
 *                 example: "project-789"
 *               taskType:
 *                 type: string
 *                 enum: [task, holiday, school, remote]
 *                 example: "task"
 *               status:
 *                 type: string
 *                 enum: [not_started, in_progress, completed]
 *                 example: "not_started"
 *               notes:
 *                 type: string
 *                 example: "Notes importantes sur la tâche"
 *               billedHours:
 *                 type: number
 *                 example: 40
 *               actualHours:
 *                 type: number
 *                 example: 35
 *               addToCalendar:
 *                 type: boolean
 *                 example: true
 *               clientPlanning:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Task created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                 syncStatus:
 *                   type: object
 *                 meta:
 *                   type: object
 *       400:
 *         description: Invalid request data
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Server error
 */
router.post(
  "/",
  authenticate,
  requireManagerOrAbove,
  taskCreateController.createTask
);

/**
 * @swagger
 * /api/v1/tasks/{id}:
 *   put:
 *     summary: Update an existing task
 *     description: Update task properties with optimistic update support
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *         example: "12a34b5c-6789-0def-ghij-klmnopqrstuv"
 *       - in: query
 *         name: async
 *         schema:
 *           type: boolean
 *         description: Use async mode for optimistic updates
 *         example: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Titre mis à jour"
 *               workPeriod:
 *                 type: object
 *                 properties:
 *                   startDate:
 *                     type: string
 *                     format: date
 *                   endDate:
 *                     type: string
 *                     format: date
 *               assignedMembers:
 *                 type: array
 *                 items:
 *                   type: string
 *               projectId:
 *                 type: string
 *               taskType:
 *                 type: string
 *                 enum: [task, holiday, school, remote]
 *               status:
 *                 type: string
 *                 enum: [not_started, in_progress, completed]
 *               notes:
 *                 type: string
 *               billedHours:
 *                 type: number
 *               actualHours:
 *                 type: number
 *               addToCalendar:
 *                 type: boolean
 *               clientPlanning:
 *                 type: boolean
 *               expectedUpdatedAt:
 *                 type: string
 *                 format: date-time
 *                 description: Expected last update timestamp for conflict detection
 *               force:
 *                 type: boolean
 *                 description: Force update even if conflict detected
 *     responses:
 *       200:
 *         description: Task updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 syncStatus:
 *                   type: object
 *                 meta:
 *                   type: object
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: Task not found
 *       409:
 *         description: Conflict detected (version mismatch)
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Server error
 */
router.put(
  "/:id",
  authenticate,
  requireManagerOrAbove,
  taskUpdateController.updateTask
);

/**
 * @swagger
 * /api/v1/tasks/{id}:
 *   delete:
 *     summary: Delete (archive) a task
 *     description: Soft delete a task by archiving it in Notion
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *         example: "12a34b5c-6789-0def-ghij-klmnopqrstuv"
 *       - in: query
 *         name: async
 *         schema:
 *           type: boolean
 *         description: Use async mode for deletion
 *         example: true
 *     responses:
 *       200:
 *         description: Task archived successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Task archived successfully"
 *                 syncStatus:
 *                   type: object
 *                 meta:
 *                   type: object
 *       400:
 *         description: Task ID is required
 *       404:
 *         description: Task not found
 *       500:
 *         description: Server error
 */
router.delete(
  "/:id",
  authenticate,
  requireManagerOrAbove,
  taskDeleteController.deleteTask
);

/**
 * @swagger
 * /api/v1/tasks/check-conflicts:
 *   post:
 *     summary: Check scheduling conflicts for a task
 *     description: Check if a task has scheduling conflicts with existing tasks
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workPeriod
 *               - assignedMembers
 *             properties:
 *               workPeriod:
 *                 type: object
 *                 required:
 *                   - startDate
 *                   - endDate
 *                 properties:
 *                   startDate:
 *                     type: string
 *                     format: date
 *                   endDate:
 *                     type: string
 *                     format: date
 *               assignedMembers:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Conflict check completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 conflicts:
 *                   type: array
 *                 meta:
 *                   type: object
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Server error
 */
router.post(
  "/check-conflicts",
  authenticate,
  taskConflictController.checkSchedulingConflicts
);

export { router as tasksCrudRouter };