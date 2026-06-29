import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";

// Routes
import authRoutes from "./routes/auth";
import meRoutes from "./routes/me";
import transactionsRoutes from "./routes/transactions";
import bankingRoutes from "./routes/banking";

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
app.use("/api/auth", authRoutes);
app.use("/api/me", meRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/banking", bankingRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;

