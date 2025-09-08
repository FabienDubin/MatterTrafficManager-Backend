import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';

// Load configuration
dotenv.config();

// Import middleware and routes
import { requestLogger } from './middleware/logging.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { setupSwagger } from './config/swagger.config';
import apiRoutes from './routes/index.route';
import logger from './config/logger.config';

const app = express();
const PORT = process.env.PORT || 3000;

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

// CORS configuration with multiple origins support
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // Check if origin is in the allowed list
    if (allowedOrigins.includes(origin) || 
        origin.includes('mattertrafficmanager.com') || 
) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
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

// API Documentation (Swagger) - Development only
setupSwagger(app);

// API Routes
app.use('/api/v1', apiRoutes);

// Root endpoint
app.get('/', (_, res) => {
  res.json({
    name: 'Matter Traffic Backend API',
    version: '1.0.0',
    status: 'operational',
    documentation: process.env.NODE_ENV !== 'production' ? '/api-docs' : 'Contact administrator',
    timestamp: new Date().toISOString()
  });
});

// 404 handler for unknown routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

/**
 * Connect to MongoDB database
 */
const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/matter-traffic';
    await mongoose.connect(mongoUri);
    logger.info('Database connection established', { database: 'MongoDB' });
  } catch (error) {
    logger.error('Database connection failed', { error, database: 'MongoDB' });
    process.exit(1);
  }
};

/**
 * Start the Express server
 */
const startServer = async (): Promise<void> => {
  try {
    await connectDB();
    
    const server = app.listen(PORT, () => {
      logger.info('Server started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        apiUrl: `http://localhost:${PORT}/api/v1`,
        healthCheck: `http://localhost:${PORT}/api/v1/health`,
        documentation: process.env.NODE_ENV !== 'production' ? `http://localhost:${PORT}/api-docs` : 'disabled'
      });
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal: string) => {
      logger.info('Graceful shutdown initiated', { signal });
      
      server.close(async () => {
        try {
          await mongoose.connection.close();
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown', { error });
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Server startup failed', { error });
    process.exit(1);
  }
};

// Start the server
startServer();

export default app;