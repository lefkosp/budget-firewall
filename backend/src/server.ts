import { connectDatabase } from "./config/database";
import { config } from "./config/env";
import app from "./app";

async function startServer() {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Start Express server
    app.listen(config.port, () => {
      console.log(`========================================`);
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📝 Environment: ${config.nodeEnv}`);
      console.log(`🌐 Frontend URL: ${config.frontendUrl}`);
      console.log(`💾 MongoDB: ${config.mongodbUri}`);
      console.log(`========================================`);
      console.log(`\n📊 CSV Import endpoint: POST /api/transactions/import-csv`);
      console.log(`📋 Logs will appear below when requests are received\n`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

