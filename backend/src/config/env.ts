import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/budget-firewall",
  jwtSecret: process.env.JWT_SECRET || "change-this-secret",
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
};

if (!config.jwtSecret || config.jwtSecret === "change-this-secret") {
  console.warn("Warning: JWT_SECRET is not set or using default value. This is insecure for production!");
}

