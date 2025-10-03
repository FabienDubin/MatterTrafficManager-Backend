import { Router } from 'express';
import teamsController from '../../controllers/teams/teams.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/v1/teams:
 *   get:
 *     summary: Get all teams
 *     description: Retrieve all teams from Notion database
 *     tags:
 *       - Teams
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of teams retrieved successfully
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
 *                         description: Team ID
 *                         example: "550e8400-e29b-41d4-a716-446655440000"
 *                       name:
 *                         type: string
 *                         description: Team name
 *                         example: "Development Team"
 *                 count:
 *                   type: integer
 *                   description: Number of teams returned
 *                   example: 5
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Timestamp of the response
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, teamsController.getAllTeams);

export default router;
