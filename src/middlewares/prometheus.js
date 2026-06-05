import client from "prom-client";

// Define metrics
export const httpRequestDurationMicroseconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in microseconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10], // 0.1 to 10 seconds
});

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
});

/**
 * Middleware to record metrics for every request
 */
export const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime();

  res.on("finish", () => {
    const duration = process.hrtime(start);
    const durationInSeconds = duration[0] + duration[1] / 1e9;

    const route = req.baseUrl + (req.route ? req.route.path : "");
    const labels = {
      method: req.method,
      route: route || "unknown",
      status: res.statusCode,
    };

    httpRequestDurationMicroseconds.observe(labels, durationInSeconds);
    httpRequestsTotal.inc(labels);
  });

  next();
};

export default metricsMiddleware;
