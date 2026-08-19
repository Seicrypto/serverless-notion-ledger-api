import type { Env, ExecutionContextLike } from "./env";

export interface RouteContext {
  ctx: ExecutionContextLike;
  env: Env;
  params: Record<string, string>;
  request: Request;
  url: URL;
}

export interface RouteDefinition {
  handler: (context: RouteContext) => Promise<Response>;
  method: string;
  path: string;
}
