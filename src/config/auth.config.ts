/**
 * Authentication configuration
 */
export const authConfig = {
  jwt: {
    secret: process.env.JWT_SECRET || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be defined in production environment');
      }
      return 'default-secret-change-in-production';
    })(),
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '8h',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  },
  rateLimit: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
};