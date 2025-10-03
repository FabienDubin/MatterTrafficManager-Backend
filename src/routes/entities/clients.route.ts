import { Router } from 'express';
import clientsController from '../../controllers/clients/clients.controller';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/v1/clients:
 *   get:
 *     summary: Get all clients
 *     description: Retrieve all clients from Notion database
 *     tags:
 *       - Clients
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of clients retrieved successfully
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
 *                         description: Client ID
 *                         example: "550e8400-e29b-41d4-a716-446655440000"
 *                       name:
 *                         type: string
 *                         description: Client name
 *                         example: "Amundi"
 *                 count:
 *                   type: number
 *                   description: Total number of clients
 *                   example: 10
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, clientsController.getAllClients);

/**
 * @swagger
 * /api/v1/clients/colors:
 *   get:
 *     summary: Get client colors configuration
 *     description: Retrieve the color configuration for all clients
 *     tags:
 *       - Clients
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Client colors retrieved successfully
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
 *                   description: Object with client IDs as keys and hex colors as values
 *                   example:
 *                     "client-id-1": "#3B82F6"
 *                     "client-id-2": "#EF4444"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/colors', authenticate, clientsController.getClientColors);

/**
 * @swagger
 * /api/v1/clients/colors:
 *   put:
 *     summary: Update client colors configuration
 *     description: Update the color configuration for clients (Admin only)
 *     tags:
 *       - Clients
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               colors:
 *                 type: object
 *                 description: Object with client IDs as keys and hex colors as values
 *                 example:
 *                   "client-id-1": "#3B82F6"
 *                   "client-id-2": "#EF4444"
 *     responses:
 *       200:
 *         description: Client colors updated successfully
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
 *                   example: "Client colors updated successfully"
 *                 data:
 *                   type: object
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Internal server error
 */
router.put('/colors', authenticate, requireAdmin, clientsController.updateClientColors);

export default router;