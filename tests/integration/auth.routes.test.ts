import request from 'supertest';
import app from '../../src/server';
import mongoose from 'mongoose';
import { UserModel, UserRole } from '../../src/models/User.model';
import { RefreshTokenModel } from '../../src/models/RefreshToken.model';
import { authService } from '../../src/services/auth.service';

describe('Auth Routes Integration Tests', () => {
  let accessToken: string;
  let refreshToken: string;
  let adminToken: string;

  beforeAll(async () => {
    // Connect to test database
    const testDbUri = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27018/matter-traffic-test';
    await mongoose.connect(testDbUri);

    // Clear database
    await UserModel.deleteMany({});
    await RefreshTokenModel.deleteMany({});

    // Create test users
    const testUser = await UserModel.create({
      email: 'test@example.com',
      password: 'testpass123',
      role: UserRole.TRAFFIC_MANAGER,
    });

    const adminUser = await UserModel.create({
      email: 'admin@example.com',
      password: 'adminpass123',
      role: UserRole.ADMIN,
    });

    // Generate tokens for testing
    const adminTokens = await authService.generateTokens(adminUser);
    adminToken = adminTokens.accessToken;
  });

  afterAll(async () => {
    // Clean up
    await UserModel.deleteMany({});
    await RefreshTokenModel.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpass123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe('test@example.com');

      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
    });

    it('should fail with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should fail with invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: 'testpass123',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should fail with missing password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh tokens successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');

      // Update tokens for next tests
      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
    });

    it('should fail with invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid or expired refresh token');
    });

    it('should fail with missing refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should get current user info with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('test@example.com');
      expect(response.body.data.role).toBe(UserRole.TRAFFIC_MANAGER);
    });

    it('should fail without token', async () => {
      const response = await request(app).get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('No token provided');
    });

    it('should fail with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid or expired token');
    });
  });

  describe('POST /api/v1/auth/users', () => {
    it('should create user successfully as admin', async () => {
      const response = await request(app)
        .post('/api/v1/auth/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newuser@example.com',
          password: 'newpass123',
          role: UserRole.CHEF_PROJET,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('newuser@example.com');
      expect(response.body.data.role).toBe(UserRole.CHEF_PROJET);
    });

    it('should fail to create user as non-admin', async () => {
      const response = await request(app)
        .post('/api/v1/auth/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'anotheruser@example.com',
          password: 'pass123',
          role: UserRole.CHEF_PROJET,
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Insufficient permissions');
    });

    it('should fail to create user with existing email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test@example.com', // Already exists
          password: 'pass123',
          role: UserRole.CHEF_PROJET,
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Email already exists');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/auth/users')
        .send({
          email: 'newuser2@example.com',
          password: 'pass123',
          role: UserRole.CHEF_PROJET,
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .send({
          refreshToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logged out successfully');
    });

    it('should fail with invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .send({
          refreshToken: 'invalid-token',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid refresh token');
    });
  });

  describe('Rate Limiting', () => {
    it('should block after too many login attempts', async () => {
      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'ratelimit@example.com',
            password: 'wrongpass',
          });
      }

      // 6th attempt should be blocked
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'ratelimit@example.com',
          password: 'wrongpass',
        });

      expect(response.status).toBe(429);
      expect(response.text).toContain('Too many login attempts');
    });
  });
});