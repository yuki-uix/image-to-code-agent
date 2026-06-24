import type { ModelRequest, TraceableModelClient } from "./model-client.ts";

export class OllamaInvalidJsonError extends Error {
  readonly rawText: string;

  constructor(message: string, rawText: string) {
    super(message);
    this.name = "OllamaInvalidJsonError";
    this.rawText = rawText;
  }
}

export class OllamaModelClient implements TraceableModelClient {
  private readonly model: string;
  private readonly host: string;

  constructor(options: { model?: string; host?: string } = {}) {
    this.model = options.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5vl:7b";
    this.host = (options.host ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  }

  async generateJson<T>(request: ModelRequest): Promise<T> {
    const { parsed } = await this.generateJsonWithRaw<T>(request);
    return parsed;
  }

  async generateJsonWithRaw<T>(request: ModelRequest): Promise<{ parsed: T; rawText: string }> {
    const content = await this.chat(request, "json");
    try {
      return {
        parsed: JSON.parse(stripFence(content)) as T,
        rawText: content
      };
    } catch (error) {
      throw new OllamaInvalidJsonError(`Ollama returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`, content);
    }
  }

  generateText(request: ModelRequest): Promise<string> {
    return this.chat(request);
  }

  private async chat(request: ModelRequest, format?: "json"): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format,
          options: { temperature: 0 },
          messages: [
            { role: "system", content: request.instructions },
            {
              role: "user",
              content: JSON.stringify(request.payload),
              ...(request.image ? { images: [request.image.base64] } : {})
            }
          ]
        })
      });
    } catch (error) {
      throw new Error(`Cannot reach Ollama at ${this.host}. Start the Ollama app first. ${error instanceof Error ? error.message : ""}`.trim());
    }
    if (!response.ok) throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
    const body = await response.json() as { message?: { content?: string }; error?: string };
    if (body.error) throw new Error(`Ollama error: ${body.error}`);
    if (!body.message?.content) throw new Error("Ollama returned an empty response.");
    return body.message.content;
  }
}

function stripFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
