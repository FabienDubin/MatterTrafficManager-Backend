import { Router } from 'express';
import membersController from '../../controllers/members/members.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/v1/members:
 *   get:
 *     summary: Get all members
 *     description: Retrieve all members from Notion database, optionally filtered by teams
 *     tags:
 *       - Members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: teams
 *         schema:
 *           type: string
 *         description: Comma-separated list of team IDs to filter members (e.g., team1,team2)
 *         example: "team-dev,team-design"
 *     responses:
 *       200:
 *         description: List of members retrieved successfully
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
 *                         description: Member ID
 *                         example: "550e8400-e29b-41d4-a716-446655440000"
 *                       name:
 *                         type: string
 *                         description: Member name
 *                         example: "John Doe"
 *                       email:
 *                         type: string
 *                         description: Member email
 *                         example: "john.doe@example.com"
 *                       teams:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: Team IDs
 *                 count:
 *                   type: number
 *                   description: Total number of members
 *                   example: 15
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, membersController.getAllMembers);

export default router;
