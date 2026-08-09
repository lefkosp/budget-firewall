import dotenv from "dotenv";

dotenv.config();

const DEFAULT_JWT_SECRET = "change-this-secret";

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/budget-firewall",
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",

  // Auth token lifetimes (Security Tier 2 — see DEVELOPMENT_PLAN.md §9)
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || "15m",
  refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || "30", 10),
  resetTokenTtlMinutes: parseInt(process.env.RESET_TOKEN_TTL_MINUTES || "30", 10),

  // Background sync cron (Phase 5 §7) — required only once the cron route
  // is mounted; validated there, not here, since it doesn't exist yet.
  cronSecret: process.env.CRON_SECRET,

  // Open Banking provider selection (Phase 5 §7). Defaults to the mock
  // provider so local dev needs zero new env vars; Nordigen credentials are
  // validated in banking.service.ts only when this is set to "nordigen".
  openBankingProvider: process.env.OPEN_BANKING_PROVIDER || "mock",
  nordigenSecretId: process.env.NORDIGEN_SECRET_ID,
  nordigenSecretKey: process.env.NORDIGEN_SECRET_KEY,
  nordigenRedirectUri: process.env.NORDIGEN_REDIRECT_URI,
  nordigenApiBaseUrl:
    process.env.NORDIGEN_API_BASE_URL || "https://bankaccountdata.gocardless.com/api/v2",
  nordigenInstitutionId: process.env.NORDIGEN_INSTITUTION_ID || "REVOLUT_REVOGB21",
};

const hasInsecureJwtSecret = !config.jwtSecret || config.jwtSecret === DEFAULT_JWT_SECRET;

if (hasInsecureJwtSecret && config.nodeEnv === "production") {
  throw new Error(
    "JWT_SECRET is not set (or is using the default placeholder value). Refusing to start in production."
  );
}

if (hasInsecureJwtSecret) {
  console.warn("Warning: JWT_SECRET is not set or using default value. This is insecure for production!");
}
