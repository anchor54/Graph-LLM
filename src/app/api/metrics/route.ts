import { NextResponse } from 'next/server';
import { recordClientMetrics } from '@/lib/observability/telemetry';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { client_ttfb, client_total_duration, network_latency } = body;

        // Record metrics using the helper function
        recordClientMetrics(
            typeof client_ttfb === 'number' ? client_ttfb : 0,
            typeof client_total_duration === 'number' ? client_total_duration : 0,
            typeof network_latency === 'number' ? network_latency : 0
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error recording metrics:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
