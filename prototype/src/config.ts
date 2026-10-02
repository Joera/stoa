/** Configuration loaded from environment. */
export interface Config {
  port: number;
  storagePath: string;
  providerKey: string | undefined;
  model: string;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env["PORT"] ?? "8080", 10),
    storagePath: process.env["STORAGE_PATH"] ?? "./agent.sqlite",
    providerKey: process.env["PROVIDER_KEY"] ?? undefined,
    model: process.env["MODEL"] ?? "gpt-5-mini",
  };
}
