// Langfuse tracing via OpenInference instrumentation for the Claude Agent SDK.
// Docs: https://langfuse.com/integrations/frameworks/claude-agent-sdk-js
//
// ESM module namespace objects are read-only and cannot be patched directly.
// We spread a mutable shallow copy and instrument that instead. index.ts must
// import `query` from this module (via ClaudeAgentSDK), not from the SDK directly.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor, isDefaultExportSpan } from "@langfuse/otel";
import { ClaudeAgentSDKInstrumentation } from "@arizeai/openinference-instrumentation-claude-agent-sdk";
import * as ClaudeAgentSDKModule from "@anthropic-ai/claude-agent-sdk";

// Mutable shallow copy — manuallyInstrument() will patch query() on this object.
export const ClaudeAgentSDK = { ...ClaudeAgentSDKModule };

let sdk: NodeSDK | null = null;

export function initTelemetry(): void {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    console.log("[telemetry] LANGFUSE keys not set — tracing disabled.");
    return;
  }

  const instrumentation = new ClaudeAgentSDKInstrumentation();
  // Patches ClaudeAgentSDK.query in-place on the mutable copy.
  instrumentation.manuallyInstrument(ClaudeAgentSDK);

  sdk = new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({
        // Include spans from the OpenInference instrumentation scope alongside
        // the default Langfuse spans so tool calls appear in the trace.
        shouldExportSpan: ({ otelSpan }) =>
          isDefaultExportSpan(otelSpan) ||
          otelSpan.instrumentationScope.name ===
            "@arizeai/openinference-instrumentation-claude-agent-sdk",
      }),
    ],
    instrumentations: [instrumentation],
  });

  sdk.start();
  console.log("[telemetry] Langfuse tracing enabled.");
}

// Flush buffered spans before the process exits — required for scripts.
export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}
