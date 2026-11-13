import "server-only";
import path from "node:path";
import fs from "node:fs";

/** Uploaded videos and images live in data/uploads and are served (unauthenticated, unguessable names) from /api/media/<file>,
 *  because Instagram and Facebook fetch the video from a public URL. Set PUBLIC_URL when the app runs behind a tunnel or domain. */
export const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
export const SAFE_NAME = /^[a-f0-9]{32}\.(mp4|mov|webm|jpg|jpeg|png)$/;
export const TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
export const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB

export function ensureDir() { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); }
export const publicBase = (origin: string) => (process.env.PUBLIC_URL || origin).replace(/\/$/, "");

/** Local file path for a media URL we host, so publishers can read it from disk instead of over HTTP. */
export function localPath(url: string | null): string | null {
  const m = url?.match(/\/api\/media\/([a-f0-9]{32}\.\w+)$/);
  return m && SAFE_NAME.test(m[1]) ? path.join(UPLOAD_DIR, m[1]) : null;
}
