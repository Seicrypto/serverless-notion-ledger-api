import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppBindings } from "../../types/hono";
import {
  forgotPasswordRoute,
  loginRoute,
  registerRoute,
} from "./schema";

export const authRouter = new OpenAPIHono<AppBindings>();

authRouter.openapi(registerRoute, (c) =>
  c.json(
    {
      message: "register is not implemented yet.",
    },
    501,
  ),
);

authRouter.openapi(loginRoute, (c) =>
  c.json(
    {
      message: "login is not implemented yet.",
    },
    501,
  ),
);

authRouter.openapi(forgotPasswordRoute, (c) =>
  c.json(
    {
      message: "forgot-password is not implemented yet.",
    },
    501,
  ),
);
