import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { validate } from '../middleware/validation.middleware';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { 
  loginSchema, 
  refreshTokenSchema, 
  logoutSchema, 
  createUserSchema 
} from '../validators/auth.validator';
import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for login attempts
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Authentication routes
 */
const router = Router();

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@mattertraffic.fr
 *               password:
 *                 type: string
 *                 example: dev123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     user:
 *                       type: object
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many requests
 */
router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  authController.login
);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post(
  '/refresh',
  validate(refreshTokenSchema),
  authController.refreshToken
);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: User logout
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       400:
 *         description: Invalid refresh token
 */
router.post(
  '/logout',
  validate(logoutSchema),
  authController.logout
);

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user info
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User info retrieved successfully
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/me',
  authenticate,
  authController.getCurrentUser
);

/**
 * @swagger
 * /api/v1/auth/users:
 *   post:
 *     summary: Create a new user (admin only)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               role:
 *                 type: string
 *                 enum: [admin, traffic_manager, chef_projet, direction]
 *               memberId:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         description: Email already exists
 */
router.post(
  '/users',
  authenticate,
  requireAdmin,
  validate(createUserSchema),
  authController.createUser
);

export default router;