import { Router } from 'express';
import notionController from '../../controllers/notion.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/v1/notion/test:
 *   get:
 *     summary: Test Notion API connection and validate all databases
 *     tags: [Notion]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection test results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 databases:
 *                   type: object
 *                   properties:
 *                     traffic:
 *                       type: object
 *                     users:
 *                       type: object
 *                     projects:
 *                       type: object
 *                     clients:
 *                       type: object
 *                     teams:
 *                       type: object
 */
router.get('/test', authenticate, notionController.testConnection);

/**
 * @swagger
 * /api/v1/notion/test-crud:
 *   post:
 *     summary: Test CRUD operations on Notion Traffic database
 *     tags: [Notion]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CRUD test results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 results:
 *                   type: object
 */
router.post('/test-crud', authenticate, notionController.testCrud);

/**
 * @swagger
 * /api/v1/notion/test-rate-limit:
 *   get:
 *     summary: Test rate limiting with 10 rapid requests
 *     tags: [Notion]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rate limit test results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 details:
 *                   type: object
 */
router.get('/test-rate-limit', authenticate, notionController.testRateLimit);

/**
 * @swagger
 * /api/v1/notion/test-relations:
 *   get:
 *     summary: Test bidirectional relations between Notion databases
 *     tags: [Notion]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Relations test results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 relations:
 *                   type: object
 */
router.get('/test-relations', authenticate, notionController.testRelations);

/**
 * @swagger
 * /api/v1/notion/test-filters:
 *   get:
 *     summary: Test complex filters and queries
 *     tags: [Notion]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Filters test results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 results:
 *                   type: object
 */
router.get('/test-filters', authenticate, notionController.testFilters);

/**
 * @swagger
 * /api/v1/notion/test-mappings:
 *   get:
 *     summary: Test property ID mappings
 *     tags: [Notion]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mappings test results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 mappingValidation:
 *                   type: object
 */
router.get('/test-mappings', authenticate, notionController.testMappings);

export default router;