import { Router } from 'express';
import { ConflictsController } from '../controllers/conflicts.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();
const conflictsController = new ConflictsController();

router.use(authenticate);
router.use(requireAdmin);

/**
 * @swagger
 * /api/v1/admin/conflicts:
 *   get:
 *     summary: Get all conflicts
 *     tags: [Conflicts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, resolved, failed]
 *         description: Filter by conflict status
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by severity level
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [task, project, member, client, team]
 *         description: Filter by entity type
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of conflicts
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
router.get('/', conflictsController.getConflicts.bind(conflictsController));

/**
 * @swagger
 * /api/v1/admin/conflicts/stats:
 *   get:
 *     summary: Get conflict statistics
 *     tags: [Conflicts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conflict statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 byStatus:
 *                   type: object
 *                 bySeverity:
 *                   type: object
 *                 byEntityType:
 *                   type: object
 *                 recentTrends:
 *                   type: array
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
router.get('/stats', conflictsController.getConflictStats.bind(conflictsController));

/**
 * @swagger
 * /api/v1/admin/conflicts/{id}:
 *   get:
 *     summary: Get conflict by ID
 *     tags: [Conflicts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conflict ID
 *     responses:
 *       200:
 *         description: Conflict details
 *       404:
 *         description: Conflict not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
router.get('/:id', conflictsController.getConflictById.bind(conflictsController));

/**
 * @swagger
 * /api/v1/admin/conflicts/{id}/resolve:
 *   post:
 *     summary: Resolve a conflict
 *     tags: [Conflicts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conflict ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - strategy
 *             properties:
 *               strategy:
 *                 type: string
 *                 enum: [notion_wins, local_wins, merged]
 *                 description: Resolution strategy
 *               mergedData:
 *                 type: object
 *                 description: Custom merged data (required if strategy is 'merged')
 *               reason:
 *                 type: string
 *                 description: Reason for resolution
 *     responses:
 *       200:
 *         description: Conflict resolved successfully
 *       400:
 *         description: Invalid strategy or missing merged data
 *       404:
 *         description: Conflict not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
router.post('/:id/resolve', conflictsController.resolveConflict.bind(conflictsController));

/**
 * @swagger
 * /api/v1/admin/conflicts/batch-resolve:
 *   post:
 *     summary: Resolve multiple conflicts at once
 *     tags: [Conflicts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - conflictIds
 *               - strategy
 *             properties:
 *               conflictIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of conflict IDs to resolve
 *               strategy:
 *                 type: string
 *                 enum: [notion_wins, local_wins]
 *                 description: Resolution strategy (merged not allowed for batch)
 *               reason:
 *                 type: string
 *                 description: Reason for batch resolution
 *     responses:
 *       200:
 *         description: Batch resolution results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resolved:
 *                   type: integer
 *                 failed:
 *                   type: integer
 *                 errors:
 *                   type: array
 *       400:
 *         description: Invalid strategy or empty conflict IDs
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
router.post('/batch-resolve', conflictsController.batchResolveConflicts.bind(conflictsController));

export default router;