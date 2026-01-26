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

const app = express();

// Logging middleware untuk debugging
if (config.env !== "test") {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// set security HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Parse JSON request body
app.use(express.json());

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// sanitize request data
app.use(sanitize);

// gzip compression
app.use(compression());

app.use(
  cors({
    origin: config.clientUrl,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
app.options("*", cors());

app.use("/uploads", express.static(path.join(process.cwd(), "public/uploads")));

// Route dasar untuk testing
app.get("/", (req, res) => {
  res.send("hello world");
});

// jwt authentication
app.use(passport.initialize());
passport.use("jwt", jwtStrategy);

// Setup Swagger
setupSwagger(app);

// v1 api routes
app.use("/", routes);

// Handle 404
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, "Not found"));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

export default app;
