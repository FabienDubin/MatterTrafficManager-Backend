import { Router } from 'express';
import projectsController from '../../controllers/projects/projects.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/v1/projects:
 *   get:
 *     summary: Get all projects
 *     description: Retrieve all projects from Notion database, with optional status filter
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by project status (e.g., "En cours", "Terminé")
 *     responses:
 *       200:
 *         description: List of projects retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Project ID
 *                         example: "550e8400-e29b-41d4-a716-446655440000"
 *                       name:
 *                         type: string
 *                         description: Project name
 *                         example: "Refonte Site Web"
 *                       status:
 *                         type: string
 *                         description: Project status
 *                         example: "En cours"
 *                       client:
 *                         type: string
 *                         description: Client name
 *                         example: "Amundi"
 *                       clientId:
 *                         type: string
 *                         description: Client ID
 *                         example: "client-123"
 *                 count:
 *                   type: number
 *                   description: Total number of projects
 *                   example: 8
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, projectsController.getAllProjects);

/**
 * @swagger
 * /api/v1/projects/active:
 *   get:
 *     summary: Get active projects
 *     description: Retrieve all projects with status "En cours"
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active projects retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       status:
 *                         type: string
 *                       client:
 *                         type: string
 *                       clientId:
 *                         type: string
 *                 count:
 *                   type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/active', authenticate, projectsController.getActiveProjects);

export default router;