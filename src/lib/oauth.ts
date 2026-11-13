import "server-only";
import crypto from "node:crypto";
import { db } from "./db";
import type { Account } from "./metrics";

// OAuth 2.0 "Connect" for Google (YouTube), LinkedIn and X. Each provider needs an app registered by
// the user, with the redirect URI `${APP_URL}/api/oauth/<provider>/callback`, and its client id/secret in .env.local.

export type Provider = "google" | "linkedin" | "x" | "meta";
type Config = {
  label: string;
  network: string;
  authorize: string;
  token: string;
  scopes: string[];
  idEnv: string;
  secretEnv: string;
  pkce: boolean;
  extraAuth?: Record<string, string>;
  basicAuth?: boolean; // send client credentials as HTTP Basic (X)
  console: string;
};

export const PROVIDERS: Record<Provider, Config> = {
  google: {
    label: "Google (YouTube)",
    network: "youtube",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
      "https://www.googleapis.com/auth/youtube.upload",
    ],
    idEnv: "GOOGLE_CLIENT_ID",
    secretEnv: "GOOGLE_CLIENT_SECRET",
    pkce: true,
    extraAuth: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    console: "https://console.cloud.google.com/apis/credentials",
  },
  linkedin: {
    label: "LinkedIn",
    network: "linkedin",
    authorize: "https://www.linkedin.com/oauth/v2/authorization",
    token: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "w_member_social"],
    idEnv: "LINKEDIN_CLIENT_ID",
    secretEnv: "LINKEDIN_CLIENT_SECRET",
    pkce: false,
    console: "https://www.linkedin.com/developers/apps",
  },
  meta: {
    label: "Facebook",
    network: "facebook", // the callback lets you pick a Page, then connects the Page and its linked Instagram
    authorize: "https://www.facebook.com/v27.0/dialog/oauth",
    token: "https://graph.facebook.com/v27.0/oauth/access_token",
    scopes: [
      "pages_show_list", "pages_read_engagement", "pages_read_user_content", "pages_manage_posts", "read_insights",
      "business_management", "instagram_basic", "instagram_manage_insights", "instagram_content_publish",
    ],
    idEnv: "META_APP_ID",
    secretEnv: "META_APP_SECRET",
    pkce: false,
    console: "https://developers.facebook.com/apps",
  },
  x: {
    label: "X",
    network: "x",
    authorize: "https://x.com/i/oauth2/authorize",
    token: "https://api.x.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    idEnv: "X_CLIENT_ID",
    secretEnv: "X_CLIENT_SECRET",
    pkce: true,
    basicAuth: true,
    console: "https://developer.x.com/en/portal/dashboard",
  },
};

export const providerForNetwork = (network: string) => (Object.keys(PROVIDERS) as Provider[]).find((p) => p !== "meta" && PROVIDERS[p].network === network);
export const isConfigured = (p: Provider) => Boolean(process.env[PROVIDERS[p].idEnv] && process.env[PROVIDERS[p].secretEnv]);
export const appUrl = (fallbackOrigin: string) => (process.env.APP_URL ?? fallbackOrigin).replace(/\/$/, "");
export const redirectUri = (p: Provider, origin: string) => `${appUrl(origin)}/api/oauth/${p}/callback`;

const b64url = (b: Buffer) => b.toString("base64url");

/** Build the provider's consent URL and remember state + PKCE verifier for 10 minutes. */
export function startAuth(p: Provider, brandId: number, userId: number, origin: string) {
  const c = PROVIDERS[p];
  const state = b64url(crypto.randomBytes(24));
  const verifier = c.pkce ? b64url(crypto.randomBytes(48)) : null;
  const redirect = redirectUri(p, origin);
  db().prepare("DELETE FROM oauth_states WHERE expires_at < datetime('now')").run();
  db().prepare("INSERT INTO oauth_states (state, provider, network, brand_id, user_id, verifier, redirect_uri, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+10 minutes'))")
    .run(state, p, c.network, brandId, userId, verifier, redirect);
  const url = new URL(c.authorize);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env[c.idEnv]!,
    redirect_uri: redirect,
    scope: c.scopes.join(" "),
    state,
    ...(verifier ? { code_challenge: b64url(crypto.createHash("sha256").update(verifier).digest()), code_challenge_method: "S256" } : {}),
    ...c.extraAuth,
  }).toString();
  if (p === "meta" && process.env.META_CONFIG_ID) {
    url.searchParams.delete("scope");
    url.searchParams.set("config_id", process.env.META_CONFIG_ID);
  }
  return url.toString();
}

/** Look up and consume a state (single use). */
export function takeState(state: string) {
  const row = db().prepare("SELECT * FROM oauth_states WHERE state = ? AND expires_at > datetime('now')").get(state) as
    | { provider: Provider; network: string; brand_id: number; user_id: number; verifier: string | null; redirect_uri: string }
    | undefined;
  db().prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  return row;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string | { message?: string }; error_description?: string };

async function tokenRequest(p: Provider, params: Record<string, string>): Promise<TokenResponse> {
  const c = PROVIDERS[p];
  const id = process.env[c.idEnv]!, secret = process.env[c.secretEnv]!;
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams(params);
  if (c.basicAuth) headers.authorization = "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
  else { body.set("client_id", id); body.set("client_secret", secret); }
  if (c.basicAuth) body.set("client_id", id);
  const res = await fetch(c.token, { method: "POST", headers, body });
  const j = (await res.json()) as TokenResponse;
  const err = typeof j.error === "object" ? j.error?.message : j.error;
  if (!res.ok || !j.access_token) throw new Error(`${c.label} token error: ${j.error_description ?? err ?? res.statusText}`);
  return j;
}

export function exchangeCode(p: Provider, code: string, redirect: string, verifier: string | null) {
  return tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: redirect, ...(verifier ? { code_verifier: verifier } : {}) });
}

export const expiresAt = (seconds?: number) => (seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null);

/** Return a usable access token, refreshing (and saving) it when it's about to expire. */
export async function freshToken(acc: Account): Promise<string> {
  if (!acc.access_token) throw new Error(`${acc.network} is not connected`);
  const p = providerForNetwork(acc.network);
  const soon = acc.token_expires_at && new Date(acc.token_expires_at).getTime() < Date.now() + 2 * 60e3;
  if (!p || !soon) return acc.access_token;
  if (!acc.refresh_token) throw new Error(`${PROVIDERS[p].label} access expired. Reconnect it in Connections.`);
  const t = await tokenRequest(p, { grant_type: "refresh_token", refresh_token: acc.refresh_token });
  db().prepare("UPDATE accounts SET access_token = ?, refresh_token = COALESCE(?, refresh_token), token_expires_at = ? WHERE id = ?")
    .run(t.access_token, t.refresh_token ?? null, expiresAt(t.expires_in), acc.id);
  acc.access_token = t.access_token;
  return t.access_token;
}

/** fetch() with a bearer token and readable errors. */
export async function api<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = json?.error?.message ?? json?.message ?? json?.detail ?? json?.title ?? text.slice(0, 200);
    throw new Error(`${new URL(url).host} ${res.status}: ${msg}`);
  }
  return json as T;
}
