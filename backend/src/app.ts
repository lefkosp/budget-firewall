import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { authRateLimiter } from "./middleware/rateLimit";
import { csrfProtection } from "./middleware/csrf";

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
import cronRoutes from "./routes/cron";
import collaboratorsRoutes from "./routes/collaborators";
import notificationsRoutes from "./routes/notifications";
import reimbursementsRoutes from "./routes/reimbursements";

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
app.use(cookieParser());
app.use(csrfProtection);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
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
app.use("/api/cron", cronRoutes);
app.use("/api/collaborators", collaboratorsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/reimbursements", reimbursementsRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;

