import mongoose from "mongoose";
import logger from "./logger.config";

/**
 * Obtient l'URI MongoDB selon l'environnement
 */
const getMongoUri = (): string => {
  const env = process.env.NODE_ENV || "development";

  if (env === "production") {
    // Azure Cosmos DB connection string
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is required in production");
    }
    return process.env.MONGODB_URI;
  } else {
    // Local MongoDB pour dev/test
    return process.env.MONGODB_URI || "mongodb://localhost:27018/mattertraffic";
  }
};

/**
 * Connecte à MongoDB avec retry logic et backoff exponentiel
 */
export const connectDB = async (): Promise<void> => {
  const uri = getMongoUri();
  const isProduction = process.env.NODE_ENV === "production";

  const options: mongoose.ConnectOptions = {
    maxPoolSize: isProduction ? 20 : 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    // Options spécifiques Cosmos DB
    ...(isProduction && {
      retryWrites: false, // Cosmos DB ne supporte pas retry writes
      ssl: true,
      sslValidate: true,
    }),
  };

  // Retry logic avec backoff exponentiel
  for (let i = 0; i < 3; i++) {
    try {
      await mongoose.connect(uri, options);
      logger.info(`MongoDB connected successfully (${process.env.NODE_ENV})`);

      // Log des infos de connexion (sans credentials)
      const dbName = mongoose.connection.db?.databaseName;
      logger.info(`Connected to database: ${dbName}`);
      break;
    } catch (error) {
      logger.error(`MongoDB connection attempt ${i + 1} failed`, error);
      if (i === 2) throw error;

      // Backoff exponentiel: 1s, 2s, 4s
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
};

/**
 * Health check function pour vérifier la santé de la base de données
 */
export const checkDatabaseHealth = async (): Promise<{
  status: "healthy" | "unhealthy";
  details: any;
}> => {
  try {
    const adminDb = mongoose.connection.db?.admin();
    const result = await adminDb?.ping();

    return {
      status: "healthy",
      details: {
        connected: mongoose.connection.readyState === 1,
        database: mongoose.connection.db?.databaseName,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        readyState: mongoose.connection.readyState,
        ping: result,
      },
    };
  } catch (error: any) {
    return {
      status: "unhealthy",
      details: { error: error.message },
    };
  }
};

/**
 * Ferme proprement la connexion MongoDB
 */
export const closeDB = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info("MongoDB connection closed successfully");
  } catch (error) {
    logger.error("Error closing MongoDB connection", error);
  }
};