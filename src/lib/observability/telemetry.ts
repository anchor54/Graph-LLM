import { metrics, Meter, Histogram } from '@opentelemetry/api';

// Instruments cache
let clientTtfbHistogram: Histogram | undefined;
let clientTotalHistogram: Histogram | undefined;
let networkLatencyHistogram: Histogram | undefined;
let backendProcessingHistogram: Histogram | undefined;
let llmTtfbHistogram: Histogram | undefined;
let llmTotalHistogram: Histogram | undefined;

export function getMeter(): Meter {
    return metrics.getMeter('graph-llm-metrics');
}

export function recordClientMetrics(ttfb: number, total: number, network: number) {
    const meter = getMeter();
    
    if (!clientTtfbHistogram) {
        clientTtfbHistogram = meter.createHistogram('client_ttfb_ms', { description: 'Client Time To First Byte', unit: 'ms' });
    }
    clientTtfbHistogram.record(ttfb);

    if (!clientTotalHistogram) {
        clientTotalHistogram = meter.createHistogram('client_total_ms', { description: 'Client Total Request Duration', unit: 'ms' });
    }
    clientTotalHistogram.record(total);

    if (!networkLatencyHistogram) {
        networkLatencyHistogram = meter.createHistogram('network_latency_ms', { description: 'Network Latency', unit: 'ms' });
    }
    networkLatencyHistogram.record(network);
}

export function recordBackendMetrics(processing: number, llmTtfb?: number, llmTotal?: number) {
    const meter = getMeter();

    if (!backendProcessingHistogram) {
        backendProcessingHistogram = meter.createHistogram('backend_processing_ms', { description: 'Backend Processing Time (pre-stream)', unit: 'ms' });
    }
    backendProcessingHistogram.record(processing);

    if (llmTtfb !== undefined) {
        if (!llmTtfbHistogram) {
            llmTtfbHistogram = meter.createHistogram('llm_ttfb_ms', { description: 'LLM Time To First Token', unit: 'ms' });
        }
        llmTtfbHistogram.record(llmTtfb);
    }

    if (llmTotal !== undefined) {
        if (!llmTotalHistogram) {
            llmTotalHistogram = meter.createHistogram('llm_total_ms', { description: 'LLM Total Generation Time', unit: 'ms' });
        }
        llmTotalHistogram.record(llmTotal);
    }
}
