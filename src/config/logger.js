import winston from "winston";
import LokiTransport from "winston-loki";
import config from "./config.js";

const enumerateErrorFormat = winston.format((info) => {
  if (info instanceof Error) {
    Object.assign(info, { message: info.stack });
  }
  return info;
});

const logger = winston.createLogger({
  level: config.env === "development" ? "debug" : "info",
  format: winston.format.combine(
    enumerateErrorFormat(),
    ...(config.env === "development"
      ? [winston.format.colorize(), winston.format.splat(), winston.format.printf(({ level, message }) => `${level}: ${message}`)]
      : [winston.format.timestamp(), winston.format.json()])
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ["error"],
    }),
    new LokiTransport({
      host: config.loki.host,
      labels: { job: "toshin-app" },
      json: true,
      replaceTimestamp: true,
      onConnectionError: (err) => console.error("Loki connection failed", err),
    }),
  ],
});

export default logger;
