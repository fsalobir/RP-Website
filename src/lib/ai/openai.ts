import type { AiEffort, AiModel } from "./contracts";
import type { TokenUsage } from "./pricing";

type ResponseInput = Array<{ role: "user" | "assistant"; content: string }>;

export type OpenAIRequest = {
  model: AiModel;
  effort: AiEffort;
  instructions: string;
  input: ResponseInput;
  safetyIdentifier: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
};

type OpenAIStreamResult =
  | { type: "text"; text: string }
  | { type: "completed"; usage: TokenUsage; response: Record<string, unknown> };

function requestBody(request: OpenAIRequest, stream: boolean) {
  return {
    model: request.model,
    reasoning: { effort: request.effort, context: "current_turn" },
    instructions: request.instructions,
    input: request.input,
    max_output_tokens: request.maxOutputTokens,
    safety_identifier: request.safetyIdentifier,
    store: false,
    stream,
    text: request.jsonSchema
      ? {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: request.jsonSchema.name,
            strict: true,
            schema: request.jsonSchema.schema,
          },
        }
      : { verbosity: "low" },
  };
}

async function openAIRequest(request: OpenAIRequest, stream: boolean): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY n'est pas configurée.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody(request, stream)),
    signal: request.signal,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response;
}

function usageFromResponse(response: Record<string, unknown>): TokenUsage {
  const usage = (response.usage ?? {}) as Record<string, unknown>;
  const details = (usage.input_tokens_details ?? {}) as Record<string, unknown>;
  return {
    inputTokens: Number(usage.input_tokens ?? 0),
    cachedInputTokens: Number(details.cached_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
  };
}

export async function* streamOpenAIText(request: OpenAIRequest): AsyncGenerator<OpenAIStreamResult> {
  const response = await openAIRequest(request, true);
  if (!response.body) throw new Error("OpenAI n'a pas renvoyé de flux.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    if (done && buffer.trim()) {
      blocks.push(buffer);
      buffer = "";
    }

    for (const block of blocks) {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data) as Record<string, unknown>;
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        yield { type: "text", text: event.delta };
      } else if (event.type === "response.completed" && event.response && typeof event.response === "object") {
        const completed = event.response as Record<string, unknown>;
        yield { type: "completed", usage: usageFromResponse(completed), response: completed };
      } else if (event.type === "response.failed") {
        throw new Error("La génération OpenAI a échoué.");
      }
    }
    if (done) break;
  }
}

function extractOutputText(response: Record<string, unknown>): string {
  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = Array.isArray((item as Record<string, unknown>).content)
        ? ((item as Record<string, unknown>).content as unknown[])
        : [];
      return content
        .filter((part): part is Record<string, unknown> => !!part && typeof part === "object")
        .filter((part) => part.type === "output_text" && typeof part.text === "string")
        .map((part) => String(part.text));
    })
    .join("");
}

export async function createOpenAIText(request: OpenAIRequest): Promise<{
  text: string;
  usage: TokenUsage;
  response: Record<string, unknown>;
}> {
  const raw = (await (await openAIRequest(request, false)).json()) as Record<string, unknown>;
  return { text: extractOutputText(raw), usage: usageFromResponse(raw), response: raw };
}
