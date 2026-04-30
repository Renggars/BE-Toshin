import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import logger from "./logger.js";

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "toshin-backend",
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://alloy:4317",
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
