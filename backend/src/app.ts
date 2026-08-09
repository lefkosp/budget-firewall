import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { authRateLimiter } from "./middleware/rateLimit";

// Routes
import authRoutes from "./routes/auth";
import meRoutes from "./routes/me";
import transactionsRoutes from "./routes/transactions";
import bankingRoutes from "./routes/banking";
import subscriptionsRoutes from "./routes/subscriptions";
import budgetsRoutes from "./routes/budgets";
import statsRoutes from "./routes/stats";
import rulesRoutes from "./routes/rules";
import intentsRoutes from "./routes/intents";

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Request logging middleware (for debugging)
app.use((req, res, next) => {
  if (req.path.includes("/import-csv")) {
    console.log(`[App] Incoming request: ${req.method} ${req.path}`);
    console.log(`[App] Headers:`, {
      authorization: req.headers.authorization ? "present" : "missing",
      "content-type": req.headers["content-type"],
    });
  }
  next();
});

// API routes
app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/me", meRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/banking", bankingRoutes);
app.use("/api/subscriptions", subscriptionsRoutes);
app.use("/api/budgets", budgetsRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/rules", rulesRoutes);
app.use("/api/intents", intentsRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;

