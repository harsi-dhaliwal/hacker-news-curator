const { Pool } = require("pg");
const app = require("./app");
const { config, validateConfig } = require("./config");
const { setPool } = require("./db");

// Database connection setup
let pool;

async function setupDatabase() {
  try {
    pool = new Pool({
      connectionString: config.database.url,
      max: config.database.maxConnections,
      idleTimeoutMillis: config.database.idleTimeout,
      connectionTimeoutMillis: config.database.connectionTimeout,
    });

    // Test database connection
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      console.log("✅ Database connection established successfully");

      // Validate database schema
      await validateDatabaseSchema(client);

      // Set the pool in the db module
      setPool(pool);
    } finally {
      client.release();
    }
  } catch (error) {
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

// Validate database schema
async function validateDatabaseSchema(client) {
  try {
    // Check if required tables exist
    const requiredTables = [
      "story_list",
      "story",
      "article",
      "tag",
      "topic",
      "story_tag",
      "story_topic",
      "summary",
      "rank_signals",
    ];

    const tableCheckQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ANY($1::text[])
    `;

    const { rows } = await client.query(tableCheckQuery, [requiredTables]);
    const existingTables = rows.map((row) => row.table_name);
    const missingTables = requiredTables.filter(
      (table) => !existingTables.includes(table)
    );

    if (missingTables.length > 0) {
      throw new Error(
        `Missing required database tables: ${missingTables.join(", ")}`
      );
    }

    console.log("✅ Database schema validation passed");
  } catch (error) {
    throw new Error(`Database schema validation failed: ${error.message}`);
  }
}

// Validate application setup
function validateAppSetup() {
  try {
    // Check if app is properly configured
    if (!app || typeof app.listen !== "function") {
      throw new Error("Express app is not properly configured");
    }

    // Check if routes are loaded (more robust check)
    if (!app._router) {
      throw new Error("Express router is not initialized");
    }

    // Check if middleware stack exists
    const middlewareStack = app._router.stack || [];
    if (middlewareStack.length === 0) {
      throw new Error("No middleware or routes are configured");
    }

    // Check if we have at least some basic middleware (body parser, routes, error handler)
    const hasBodyParser = middlewareStack.some(
      (layer) =>
        layer.name === "jsonParser" || layer.name === "urlencodedParser"
    );
    const hasRoutes = middlewareStack.some(
      (layer) => layer.route || layer.name === "router"
    );

    if (!hasBodyParser) {
      console.warn("⚠️ Warning: Body parser middleware not detected");
    }

    if (!hasRoutes) {
      throw new Error("No route handlers are configured");
    }

    console.log("✅ Application setup validation passed");
  } catch (error) {
    throw new Error(`Application setup validation failed: ${error.message}`);
  }
}

// Graceful shutdown handling
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

    if (pool) {
      console.log("Closing database connections...");
      await pool.end();
      console.log("✅ Database connections closed");
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
    shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    shutdown("unhandledRejection");
  });
}

// Main startup function
async function startServer() {
  try {
    console.log("🚀 Starting api-node service...");
    console.log(`🔧 Environment: ${config.nodeEnv}`);
    console.log(`🌐 Port: ${config.port}`);

    // Validate configuration
    console.log("🔍 Validating configuration...");
    validateConfig();
    console.log("✅ Configuration validation passed");

    // Validate application setup
    console.log("🔍 Validating application setup...");
    validateAppSetup();

    // Setup database
    console.log("🗄️ Setting up database connection...");
    await setupDatabase();

    // Setup graceful shutdown
    setupGracefulShutdown();

    // Start the server
    const server = app.listen(config.port, () => {
      console.log(`✅ api-node service started successfully`);
      console.log(`🌐 Server listening on port ${config.port}`);
      console.log(`🔧 Environment: ${config.nodeEnv}`);
      console.log(`📊 Database: Connected`);
      console.log(`🚀 Service ready to handle requests`);
    });

    // Handle server errors
    server.on("error", (error) => {
      console.error("❌ Server error:", error);
      process.exit(1);
    });
  } catch (error) {
    console.error("❌ Failed to start api-node service:", error.message);
    console.error("Stack trace:", error.stack);

    // Clean up any resources that might have been created
    if (pool) {
      await pool.end();
    }

    process.exit(1);
  }
}

// Only start if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
