import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

const config = {
  env: process.env.NODE_ENV,
  port: process.env.PORT || 4000,
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpirationMinutes: process.env.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: process.env.JWT_REFRESH_EXPIRATION_DAYS,
  },

  clientUrls: [
    "http://localhost:3000",
    "http://localhost:61909",
    "https://lesli-thorny-bunny.ngrok-free.dev",
  ],
  redis: {
    url: process.env.REDIS_URL,
    enabled: process.env.REDIS_ENABLED === "true",
  },
};

export default config;
