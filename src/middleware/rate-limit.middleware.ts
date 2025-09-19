import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for authentication endpoints
 * Protection against brute force attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
});

// No API rate limiter needed - APIs are not public
// No webhook rate limiter needed - webhooks don't need rate limiting
// Notion throttle will be handled directly in the service (Task 4)