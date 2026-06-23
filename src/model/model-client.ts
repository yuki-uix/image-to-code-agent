export type ModelRequest = {
  agent: "visual-analyst" | "component-architect" | "ui-architect" | "code-generator";
  instructions: string;
  payload: unknown;
  image?: { mimeType: string; base64: string };
};

export interface ModelClient {
  generateJson<T>(request: ModelRequest): Promise<T>;
  generateText(request: ModelRequest): Promise<string>;
}

export interface TraceableModelClient extends ModelClient {
  generateJsonWithRaw<T>(request: ModelRequest): Promise<{ parsed: T; rawText: string }>;
}
