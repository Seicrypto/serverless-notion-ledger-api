export interface NotionRequestEnvelope {
  body?: unknown;
  headers?: Record<string, string>;
  method: "DELETE" | "GET" | "PATCH" | "POST";
  path: string;
}

export interface NotionResponseEnvelope {
  body: unknown;
  headers: Record<string, string>;
  ok: boolean;
  status: number;
}
