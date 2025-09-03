import { z } from 'zod';

/**
 * Login request validation schema
 */
export const loginSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email('Invalid email format')
      .toLowerCase()
      .trim(),
    password: z
      .string()
      .min(1, 'Password is required'),
  }),
});

/**
 * Refresh token request validation schema
 */
export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z
      .string()
      .min(1, 'Refresh token is required'),
  }),
});

/**
 * Logout request validation schema
 */
export const logoutSchema = z.object({
  body: z.object({
    refreshToken: z
      .string()
      .min(1, 'Refresh token is required'),
  }),
});

/**
 * Create user validation schema
 */
export const createUserSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email('Invalid email format')
      .toLowerCase()
      .trim(),
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters'),
    role: z.enum(['admin', 'traffic_manager', 'chef_projet', 'direction']),
    memberId: z.string().optional(),
  }),
});

// Export types
export type LoginRequest = z.infer<typeof loginSchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;
export type LogoutRequest = z.infer<typeof logoutSchema>;
export type CreateUserRequest = z.infer<typeof createUserSchema>;