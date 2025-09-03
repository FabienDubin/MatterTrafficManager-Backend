import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Import middleware and routes
import { requestLogger } from './middleware/logging.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { setupSwagger } from './config/swagger.config';
import apiRoutes from './routes/index.route';

const app = express();

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(requestLogger);

// API Documentation (Swagger)
setupSwagger(app);

// API Routes
app.use('/api/v1', apiRoutes);

// Root endpoint
app.get('/', (_, res) => {
  res.json({
    name: 'Matter Traffic Backend API',
    version: '1.0.0',
    status: 'operational',
    documentation: '/api-docs',
    timestamp: new Date().toISOString()
  });
});

// 404 handler for unknown routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

export default app;