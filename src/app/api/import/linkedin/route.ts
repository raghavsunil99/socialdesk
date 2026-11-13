import { NextResponse } from "next/server";
import { brandFromRequest } from "@/lib/brand";
import { importLinkedInExport } from "@/lib/importers/linkedin";

// POST multipart/form-data with `file` = LinkedIn's analytics export (.xlsx). Editors and owners.
export async function POST(req: Request) {
  const brand = await brandFromRequest(req, "editor");
  if (brand instanceof NextResponse) return brand;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose the .xlsx file LinkedIn exported" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "That file is over 10 MB; LinkedIn exports are much smaller. Is it the right file?" }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "LinkedIn exports are .xlsx files" }, { status: 400 });
  try {
    const summary = await importLinkedInExport(brand.id, file.name, await file.arrayBuffer());
    return NextResponse.json({ data: summary });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
