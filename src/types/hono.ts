import type { Env } from "./env";

export type AppBindings = {
  Bindings: Env;
  Variables: {
    requestId: string;
  };
};
