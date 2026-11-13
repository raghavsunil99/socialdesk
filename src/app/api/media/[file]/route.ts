import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { SAFE_NAME, TYPES, UPLOAD_DIR } from "@/lib/media";

// Public, range-capable file serving for uploaded media (names are 128-bit random).
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!SAFE_NAME.test(file)) return new Response("not found", { status: 404 });
  const p = path.join(UPLOAD_DIR, file);
  if (!fs.existsSync(p)) return new Response("not found", { status: 404 });
  const size = fs.statSync(p).size;
  const type = TYPES[file.split(".").pop()!];
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    return new Response(Readable.toWeb(fs.createReadStream(p, { start, end })) as ReadableStream, {
      status: 206, headers: { "content-type": type, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes" },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(p)) as ReadableStream, { headers: { "content-type": type, "content-length": String(size), "accept-ranges": "bytes" } });
}
