import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic import to avoid bundling Node-only modules in Edge Runtime
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');

    const serviceName = process.env.OTEL_SERVICE_NAME || 'weave';

    // OTLP exporters automatically read OTEL_EXPORTER_OTLP_* environment variables
    const traceExporter = new OTLPTraceExporter();
    const metricExporter = new OTLPMetricExporter();

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [SEMRESATTRS_SERVICE_NAME]: serviceName,
      }),
      traceExporter,
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 5000,
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
    
    console.log(`OpenTelemetry initialized for service: ${serviceName}`);
  }
}
