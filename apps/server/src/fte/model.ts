import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { env } from "../env";

/**
 * Meta's Muse Spark Open — the only model AutoFTE calls at runtime.
 * Primary: Baseten. Fallback: Fireworks (same open weights). Retry once, then fall back.
 */
interface Provider {
  name: "baseten" | "fireworks";
  client: OpenAI;
  model: string;
}

const providers: Provider[] = [];
if (env.BASETEN_API_KEY) {
  providers.push({ name: "baseten", client: new OpenAI({ apiKey: env.BASETEN_API_KEY, baseURL: env.BASETEN_BASE_URL, timeout: 90_000, maxRetries: 0 }), model: env.BASETEN_MODEL });
}
if (env.FIREWORKS_API_KEY && env.FIREWORKS_MODEL) {
  providers.push({ name: "fireworks", client: new OpenAI({ apiKey: env.FIREWORKS_API_KEY, baseURL: env.FIREWORKS_BASE_URL, timeout: 90_000, maxRetries: 0 }), model: env.FIREWORKS_MODEL });
}

export const modelConfigured = () => providers.length > 0;
export const primaryModelName = () => providers[0]?.model ?? "not configured";
export const primaryProviderName = () => providers[0]?.name ?? null;

export type Effort = "low" | "medium" | "high" | "xhigh";

export interface ChatResult {
  message: OpenAI.Chat.Completions.ChatCompletionMessage & { reasoning_content?: string };
  finishReason: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
}

function retryable(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  if (!status) return true; // network error / timeout
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export async function chat(opts: { messages: ChatCompletionMessageParam[]; tools?: ChatCompletionTool[]; effort?: Effort; maxTokens?: number; json?: boolean }): Promise<ChatResult> {
  if (!providers.length) throw new Error("No Meta model provider configured (set BASETEN_API_KEY in .env)");
  let lastErr: unknown;
  for (const p of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        const r = await p.client.chat.completions.create({
          model: p.model,
          messages: opts.messages,
          ...(opts.tools?.length ? { tools: opts.tools, tool_choice: "auto" as const } : {}),
          max_tokens: opts.maxTokens ?? 1800,
          ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
          // Muse Spark Open always reasons; "low" keeps chat replies fast.
          ...({ reasoning_effort: opts.effort ?? "low" } as Record<string, unknown>),
        });
        const choice = r.choices[0]!;
        return {
          message: choice.message as ChatResult["message"],
          finishReason: choice.finish_reason,
          provider: p.name,
          model: p.model,
          promptTokens: r.usage?.prompt_tokens ?? 0,
          completionTokens: r.usage?.completion_tokens ?? 0,
          ms: Date.now() - t0,
        };
      } catch (e) {
        lastErr = e;
        if (!retryable(e)) break;
        await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
