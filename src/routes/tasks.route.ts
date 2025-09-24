import { Router } from "express";
import { tasksController } from "../controllers/tasks.controller";
import { authenticate } from "../middleware/auth.middleware";

/**
 * Tasks routes
 */
const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/v1/tasks/calendar:
 *   get:
 *     summary: Get tasks for calendar view
 *     description: Retrieve tasks within a date range formatted for calendar display
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the period (YYYY-MM-DD)
 *         example: "2025-01-01"
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the period (YYYY-MM-DD)
 *         example: "2025-01-31"
 *     responses:
 *       200:
 *         description: Tasks retrieved successfully
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
 *                     tasks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "task-123"
 *                           title:
 *                             type: string
 *                             example: "Développement feature X"
 *                           workPeriod:
 *                             type: object
 *                             properties:
 *                               startDate:
 *                                 type: string
 *                                 format: date-time
 *                               endDate:
 *                                 type: string
 *                                 format: date-time
 *                           assignedMembers:
 *                             type: array
 *                             items:
 *                               type: string
 *                           projectId:
 *                             type: string
 *                           clientId:
 *                             type: string
 *                           taskType:
 *                             type: string
 *                             enum: [task, holiday, remote]
 *                           status:
 *                             type: string
 *                             enum: [not_started, in_progress, completed]
 *                           notes:
 *                             type: string
 *                           billedHours:
 *                             type: number
 *                           actualHours:
 *                             type: number
 *                     cacheHit:
 *                       type: boolean
 *                       example: true
 *                     period:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: date
 *                         end:
 *                           type: string
 *                           format: date
 *                 meta:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: number
 *                       example: 15
 *                     cached:
 *                       type: boolean
 *                       example: true
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Invalid query parameters"
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       429:
 *         description: Rate limit exceeded (Notion API)
 *       500:
 *         description: Internal server error
 *       503:
 *         description: Notion service temporarily unavailable
 */
router.get("/calendar", tasksController.getCalendarTasks);

/**
 * @swagger
 * /api/v1/tasks/stats/today:
 *   get:
 *     summary: Get today's tasks statistics
 *     description: Retrieve statistics for tasks scheduled for today
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
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
 *                     total:
 *                       type: number
 *                       example: 10
 *                     completed:
 *                       type: number
 *                       example: 3
 *                     inProgress:
 *                       type: number
 *                       example: 5
 *                     notStarted:
 *                       type: number
 *                       example: 2
 *                     byType:
 *                       type: object
 *                       properties:
 *                         task:
 *                           type: number
 *                         holiday:
 *                           type: number
 *                         school:
 *                           type: number
 *                         remote:
 *                           type: number
 *       500:
 *         description: Failed to fetch statistics
 */
router.get("/stats/today", tasksController.getTodayStats.bind(tasksController));

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
 *         example: "task-123"
 *     responses:
 *       200:
 *         description: Task retrieved successfully
 *       404:
 *         description: Task not found
 *       500:
 *         description: Failed to fetch task
 */
router.get("/:id", tasksController.getTaskById);

/**
 * @swagger
 * /api/v1/tasks:
 *   post:
 *     summary: Create a new task
 *     description: Create a new task in Notion and cache it
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
 *               - title
 *               - workPeriod
 *             properties:
 *               title:
 *                 type: string
 *               workPeriod:
 *                 type: object
 *                 properties:
 *                   startDate:
 *                     type: string
 *                     format: date-time
 *                   endDate:
 *                     type: string
 *                     format: date-time
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
 *     responses:
 *       201:
 *         description: Task created successfully
 *       400:
 *         description: Invalid request data
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Failed to create task
 */
router.post("/", tasksController.createTask);

/**
 * @swagger
 * /api/v1/tasks/{id}:
 *   put:
 *     summary: Update an existing task
 *     description: Update task in Notion and update cache
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               workPeriod:
 *                 type: object
 *               assignedMembers:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *               version:
 *                 type: number
 *     responses:
 *       200:
 *         description: Task updated successfully
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: Task not found
 *       500:
 *         description: Failed to update task
 */
router.put("/:id", tasksController.updateTask);

/**
 * @swagger
 * /api/v1/tasks/{id}:
 *   delete:
 *     summary: Archive a task
 *     description: Soft delete (archive) a task in Notion
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
 *     responses:
 *       200:
 *         description: Task archived successfully
 *       404:
 *         description: Task not found
 *       500:
 *         description: Failed to delete task
 */
router.delete("/:id", tasksController.deleteTask);

/**
 * @swagger
 * /api/v1/tasks/batch:
 *   post:
 *     summary: Batch update tasks
 *     description: Update multiple tasks in a single request
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
 *               - updates
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     data:
 *                       type: object
 *     responses:
 *       200:
 *         description: All tasks updated successfully
 *       207:
 *         description: Partial success (some updates failed)
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Failed to process batch update
 */
router.post("/batch", tasksController.batchUpdateTasks);

export default router;