export const authConfig = {
  jwt: {
    secret: process.env.JWT_SECRET || 'test-secret',
    accessExpiry: '8h',
    refreshExpiry: '7d',
  },
  bcrypt: {
    rounds: 10,
  },
  rateLimit: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
  },
};