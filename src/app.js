import express from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import passport from "passport";
import httpStatus from "http-status";
import config from "./config/config.js";
import morgan from "./config/morgan.js";
import jwtStrategy from "./config/passport.js";
import routes from "./routes/index.js";
import { errorConverter, errorHandler } from "./middlewares/error.js";
import ApiError from "./utils/ApiError.js";
import setupSwagger from "./docs/swaggerConfig.js";
import { sanitize } from "./middlewares/sanitizeXss.js";
import path from "path";
import logger from "./config/logger.js";

const app = express();

// 1. MATIKAN ETAG (Sangat Penting untuk Flutter Web)
// Ini mencegah status 304 yang membuat browser salah ambil cache index.html
app.set("etag", false);

// Logging middleware
if (config.env !== "test") {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
  logger.info(`Morgan logging enabled. Environment: ${config.env}`);
} else {
  logger.info("Morgan logging skipped (TEST environment)");
}

// 2. SETUP CORS (Menggunakan library agar lebih stabil)
app.use(
  cors({
    origin: "*", // Mengizinkan semua origin
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "ngrok-skip-browser-warning",
    ],
    credentials: true,
  }),
);

// 3. SET SECURITY HEADERS
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Dimatikan agar tidak bentrok dengan Flutter Web
  }),
);

// Parse JSON & URL Encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sanitize & Compression
app.use(sanitize);
app.use(compression());

// Static Files
app.use("/uploads", express.static(path.join(process.cwd(), "public/uploads")));
app.use("/exports", express.static(path.join(process.cwd(), "public/exports")));
app.use("/app-releases", express.static(path.join(process.cwd(), "storage/releases")));

// Route dasar
app.get("/", (req, res) => {
  res.send("API Server is Running...");
});

// Authentication
app.use(passport.initialize());
passport.use("jwt", jwtStrategy);

// Swagger
setupSwagger(app);

// 4. API ROUTES
// Pastikan rute ini benar. Jika routes berisi rute master,
// panggilannya akan menjadi: http://localhost:4001/master/shift
app.use("/", routes);
app.options("*", cors());

// --- Error Handling ---
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, "Not found"));
});

app.use(errorConverter);
app.use(errorHandler);

export default app;
