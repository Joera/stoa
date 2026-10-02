/** Configuration loaded from environment. */
export interface Config {
  port: number;
  storagePath: string;
  veniceKey: string | undefined;
  model: string;
  veniceBaseUrl: string;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env["PORT"] ?? "8080", 10),
    storagePath: process.env["STORAGE_PATH"] ?? "./agent.sqlite",
    veniceKey: process.env["VENICE_INFERENCE_KEY"] ?? undefined,
    model: process.env["MODEL"] ?? "deepseek-v4-flash-0731",
    veniceBaseUrl: process.env["VENICE_BASE_URL"] ?? "https://api.venice.ai/api/v1",
  };
}
