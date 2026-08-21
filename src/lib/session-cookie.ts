import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SESSION_TTL_SECONDS } from "./jwt";

export const SESSION_COOKIE_NAME = "raidledger_session";

export function clearSessionCookie(context: Context) {
  deleteCookie(context, SESSION_COOKIE_NAME, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
  });
}

export function getSessionCookie(context: Context): string | undefined {
  return getCookie(context, SESSION_COOKIE_NAME);
}

export function setSessionCookie(
  context: Context,
  token: string,
  secure: boolean,
) {
  setCookie(context, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "Lax",
    secure,
  });
}
