import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import logger from "./logger.js";

// Bug Fix #4: SemanticResourceAttributes deprecated di @opentelemetry/semantic-conventions v1.x
// Gunakan string literal "service.name" secara langsung
const sdk = new NodeSDK({
  resource: new Resource({
    "service.name": process.env.OTEL_SERVICE_NAME || "toshin-backend",
  }),
  // Bug Fix #5: OTLPTraceExporter (gRPC) tidak menggunakan http:// prefix
  // Format gRPC adalah "host:port" bukan "http://host:port"
  traceExporter: new OTLPTraceExporter({
    url: (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://alloy:4317")
      .replace(/^https?:\/\//, ""),
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

export const initTracing = () => {
  if (process.env.OTEL_SDK_DISABLED === "true") {
    logger.info("OpenTelemetry SDK is disabled");
    return;
  }

  sdk.start();
  logger.info("OpenTelemetry SDK started");

  process.on("SIGTERM", () => {
    sdk
      .shutdown()
      .then(() => logger.info("Tracing terminated"))
      .catch((error) => logger.error("Error terminating tracing", error))
      .finally(() => process.exit(0));
  });
};

export default sdk;
