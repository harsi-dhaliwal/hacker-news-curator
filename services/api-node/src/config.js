// Configuration for api-node service
const config = {
  // Server configuration
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || "development",

  // Database configuration
  database: {
    url: process.env.DATABASE_URL,
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 10,
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000,
  },

  // Caching configuration
  cache: {
    ttl: {
      feed: parseInt(process.env.CACHE_TTL_FEED) || 60,
      search: parseInt(process.env.CACHE_TTL_SEARCH) || 60,
    },
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || "info",
    enableConsole: process.env.LOG_ENABLE_CONSOLE !== "false",
  },
};

// Validate required configuration
function validateConfig() {
  const errors = [];

  // Check required environment variables
  if (!config.database.url) {
    errors.push("DATABASE_URL is required");
  }

  // Validate database URL format
  if (
    config.database.url &&
    !config.database.url.startsWith("postgres://") &&
    !config.database.url.startsWith("postgresql://")
  ) {
    errors.push("DATABASE_URL must be a valid PostgreSQL connection string");
  }

  // Validate port number
  if (config.port < 1 || config.port > 65535) {
    errors.push("PORT must be between 1 and 65535");
  }

  // Validate database connection settings
  if (config.database.maxConnections < 1) {
    errors.push("DB_MAX_CONNECTIONS must be at least 1");
  }

  if (config.database.idleTimeout < 1000) {
    errors.push("DB_IDLE_TIMEOUT must be at least 1000ms");
  }

  if (config.database.connectionTimeout < 1000) {
    errors.push("DB_CONNECTION_TIMEOUT must be at least 1000ms");
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
  }

  return true;
}

module.exports = { config, validateConfig };
