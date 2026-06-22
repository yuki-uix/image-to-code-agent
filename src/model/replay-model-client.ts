import { readFile } from "node:fs/promises";
import type { ModelClient, ModelRequest } from "./model-client.ts";

type Responses = Record<ModelRequest["agent"], unknown>;

export class ReplayModelClient implements ModelClient {
  private readonly responses: Responses;

  constructor(responses: Responses) {
    this.responses = responses;
  }

  static async fromFile(path: string): Promise<ReplayModelClient> {
    return new ReplayModelClient(JSON.parse(await readFile(path, "utf8")) as Responses);
  }

  async generateJson<T>({ agent }: ModelRequest): Promise<T> {
    const value = this.responses[agent];
    if (value === undefined) throw new Error(`No replay response for ${agent}`);
    return structuredClone(value) as T;
  }

  async generateText({ agent }: ModelRequest): Promise<string> {
    const value = this.responses[agent];
    if (typeof value !== "string") throw new Error(`Replay response for ${agent} is not text`);
    return value;
  }
}
