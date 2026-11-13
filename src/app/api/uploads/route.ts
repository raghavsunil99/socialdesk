import { NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { brandFromRequest } from "@/lib/brand";
import { ensureDir, MAX_BYTES, publicBase, TYPES, UPLOAD_DIR } from "@/lib/media";

// POST /api/uploads?ext=mp4  (raw file body) -> { url }
export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "creator");
  if (brand instanceof NextResponse) return brand;
  const url = new URL(req.url);
  const ext = (url.searchParams.get("ext") ?? "").toLowerCase();
  if (!TYPES[ext]) return NextResponse.json({ error: "Upload an mp4, mov, webm, jpg or png file" }, { status: 400 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return NextResponse.json({ error: "File is over 1 GB" }, { status: 413 });
  if (!req.body) return NextResponse.json({ error: "empty upload" }, { status: 400 });
  ensureDir();
  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  const file = path.join(UPLOAD_DIR, name);
  let size = 0;
  const counted = Readable.fromWeb(req.body as never).on("data", (c: Buffer) => { size += c.length; if (size > MAX_BYTES) counted.destroy(new Error("File is over 1 GB")); });
  try { await pipeline(counted, fs.createWriteStream(file)); }
  catch (e) { fs.rmSync(file, { force: true }); return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ data: { url: `${publicBase(url.origin)}/api/media/${name}`, size } }, { status: 201 });
}
