import "server-only";
import ExcelJS from "exceljs";
import { db } from "../db";
import { getAccount } from "../metrics";

// Import of LinkedIn's own analytics export (profile → Analytics → Post impressions → Export, an .xlsx).
// The export has sheets named DISCOVERY, ENGAGEMENT, TOP POSTS, FOLLOWERS and DEMOGRAPHICS. The parser
// finds sheets and header rows by name instead of fixed positions, because LinkedIn changes the layout.
//
// Mapping: daily Impressions -> views and reach (the export has no daily reach), daily Engagements ->
// engagements, New followers -> followers_gained, top posts -> content (engagements stored as likes).

type Cell = string | number | Date | null;
type Sheet = { name: string; rows: Cell[][] };

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text; // hyperlink
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue); // formula
  }
  return String(v);
}

async function readWorkbook(buf: ArrayBuffer): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets.map((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const vals = (row.values as ExcelJS.CellValue[]).slice(1).map(cellValue);
      rows[n - 1] = vals;
    });
    return { name: ws.name, rows: Array.from(rows, (r) => r ?? []) };
  });
}

const norm = (c: Cell) => String(c ?? "").trim().toLowerCase();
const num = (c: Cell) => {
  if (typeof c === "number") return c;
  const n = Number(String(c ?? "").replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
/** LinkedIn writes dates as M/D/YYYY text, or real Excel dates. */
function toDate(c: Cell): string | null {
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  if (typeof c === "number" && c > 30000 && c < 80000) return new Date(Date.UTC(1899, 11, 30) + c * 864e5).toISOString().slice(0, 10);
  const s = String(c ?? "").trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const sheet = (sheets: Sheet[], key: string) => sheets.find((s) => s.name.toLowerCase().replace(/\s+/g, " ").includes(key));
/** Index of the first row whose cells include every wanted header (case-insensitive prefix match). */
function headerRow(rows: Cell[][], wanted: string[], from = 0) {
  for (let i = from; i < rows.length; i++) {
    const cells = rows[i].map(norm);
    if (wanted.every((w) => cells.some((c) => c.startsWith(w)))) return i;
  }
  return -1;
}
const col = (row: Cell[], name: string, from = 0) => row.findIndex((c, i) => i >= from && norm(c).startsWith(name));

export type ImportSummary = {
  days: number; from: string | null; to: string | null; totalFollowers: number | null;
  posts: number; demographics: string[]; sheetsFound: string[]; warnings: string[];
};

export async function importLinkedInExport(brandId: number, fileName: string, buf: ArrayBuffer): Promise<ImportSummary> {
  let sheets: Sheet[];
  try {
    sheets = await readWorkbook(buf);
  } catch {
    throw new Error("That file isn't a readable .xlsx spreadsheet. Upload the file LinkedIn's Export button downloads.");
  }
  const warnings: string[] = [];
  const summary: ImportSummary = { days: 0, from: null, to: null, totalFollowers: null, posts: 0, demographics: [], sheetsFound: sheets.map((s) => s.name), warnings };

  const engagement = sheet(sheets, "engagement");
  const followers = sheet(sheets, "follower");
  const topPosts = sheet(sheets, "top post");
  const demographics = sheet(sheets, "demographic");
  if (!engagement && !followers && !topPosts) throw new Error(`This doesn't look like a LinkedIn analytics export (sheets found: ${summary.sheetsFound.join(", ") || "none"}).`);

  // Parse everything first, then write in one transaction.
  const daily = new Map<string, { impressions?: number; engagements?: number; gained?: number }>();
  if (engagement) {
    const h = headerRow(engagement.rows, ["date", "impressions"]);
    if (h < 0) warnings.push("ENGAGEMENT sheet: couldn't find the Date / Impressions header");
    else {
      const [dc, ic, ec] = [col(engagement.rows[h], "date"), col(engagement.rows[h], "impressions"), col(engagement.rows[h], "engagements")];
      for (const r of engagement.rows.slice(h + 1)) {
        const date = toDate(r[dc]);
        if (!date) continue;
        daily.set(date, { ...daily.get(date), impressions: num(r[ic]) ?? 0, engagements: ec >= 0 ? num(r[ec]) ?? 0 : undefined });
      }
    }
  } else warnings.push("No ENGAGEMENT sheet, so no daily impressions");

  if (followers) {
    // "Total followers on 11/13/2026: 1,234" sits above the daily table.
    for (const r of followers.rows.slice(0, 6)) {
      const t = r.map((c) => String(c ?? "")).join(" ");
      const m = t.match(/total followers[^:]*:\s*([\d,]+)/i);
      if (m) summary.totalFollowers = Number(m[1].replace(/,/g, ""));
      else if (/total followers/i.test(t)) summary.totalFollowers = r.map(num).find((n) => n !== null) ?? summary.totalFollowers;
    }
    const h = headerRow(followers.rows, ["date", "new followers"]);
    if (h < 0) warnings.push("FOLLOWERS sheet: couldn't find the Date / New followers header");
    else {
      const [dc, nc] = [col(followers.rows[h], "date"), col(followers.rows[h], "new followers")];
      for (const r of followers.rows.slice(h + 1)) {
        const date = toDate(r[dc]);
        if (date) daily.set(date, { ...daily.get(date), gained: num(r[nc]) ?? 0 });
      }
    }
  }

  // TOP POSTS has two side-by-side tables (by engagements, by impressions); merge them by post URL.
  const posts = new Map<string, { date: string | null; engagements?: number; impressions?: number }>();
  if (topPosts) {
    const h = headerRow(topPosts.rows, ["post url", "post publish date"]);
    if (h >= 0) {
      const head = topPosts.rows[h];
      for (let start = 0; start < head.length; start++) {
        if (!norm(head[start]).startsWith("post url")) continue;
        const dc = col(head, "post publish date", start), ec = col(head, "engagements", start), ic = col(head, "impressions", start);
        const next = head.findIndex((c, i) => i > start && norm(c).startsWith("post url"));
        const within = (i: number) => i >= 0 && (next < 0 || i < next);
        for (const r of topPosts.rows.slice(h + 1)) {
          const url = String(r[start] ?? "").trim();
          if (!url.startsWith("http")) continue;
          const p = posts.get(url) ?? { date: null };
          p.date = p.date ?? (within(dc) ? toDate(r[dc]) : null);
          if (within(ec)) p.engagements = num(r[ec]) ?? p.engagements;
          if (within(ic)) p.impressions = num(r[ic]) ?? p.impressions;
          posts.set(url, p);
        }
      }
    } else warnings.push("TOP POSTS sheet: couldn't find the Post URL header");
  }

  const demo: { metric: string; label: string; value: number }[] = [];
  if (demographics) {
    const h = headerRow(demographics.rows, ["top demographics", "value", "percentage"]);
    if (h >= 0) {
      const [tc, vc, pc] = [col(demographics.rows[h], "top demographics"), col(demographics.rows[h], "value"), col(demographics.rows[h], "percentage")];
      const metricFor = (t: string) =>
        t.startsWith("location") ? "city" : t.startsWith("job title") ? "job_title" : t.startsWith("industr") ? "industry" :
        t.startsWith("seniorit") ? "seniority" : t.startsWith("company size") ? "company_size" : t.startsWith("compan") ? "company" : null;
      for (const r of demographics.rows.slice(h + 1)) {
        const metric = metricFor(norm(r[tc]));
        const label = String(r[vc] ?? "").trim();
        let pct = num(r[pc]);
        if (!metric || !label || pct === null) continue;
        if (pct <= 1 && !String(r[pc]).includes("%")) pct *= 100; // stored as a fraction
        demo.push({ metric, label, value: +pct.toFixed(2) });
      }
    }
  }

  const dates = [...daily.keys()].sort();
  summary.days = dates.length;
  summary.from = dates[0] ?? null;
  summary.to = dates.at(-1) ?? null;
  summary.posts = posts.size;
  summary.demographics = [...new Set(demo.map((x) => x.metric))];
  if (!dates.length && !posts.size) throw new Error("The export didn't contain any daily rows or posts.");

  const d = db();
  d.exec("BEGIN");
  try {
    // An imported LinkedIn account: keeps a live (posting) connection if there is one, otherwise "import".
    d.prepare("INSERT OR IGNORE INTO accounts (brand_id, network, handle, connector) VALUES (?, 'linkedin', 'LinkedIn profile', 'import')").run(brandId);
    const acc = getAccount(brandId, "linkedin")!;
    if (acc.connector === "demo" || acc.connector === "none") {
      for (const t of ["metric_points", "content", "distributions", "best_times"]) d.prepare(`DELETE FROM ${t} WHERE account_id = ?`).run(acc.id);
      d.prepare("UPDATE accounts SET connector = 'import' WHERE id = ?").run(acc.id);
    }
    const put = d.prepare("INSERT OR REPLACE INTO metric_points (account_id, subject, metric, date, value) VALUES (?, 'account', ?, ?, ?)");
    for (const [date, v] of daily) {
      if (v.impressions !== undefined) { put.run(acc.id, "views", date, v.impressions); put.run(acc.id, "reach", date, v.impressions); }
      if (v.engagements !== undefined) put.run(acc.id, "engagements", date, v.engagements);
      if (v.gained !== undefined) put.run(acc.id, "followers_gained", date, v.gained);
    }
    // Follower history: walk back from the total using daily new followers (LinkedIn gives no unfollows).
    if (summary.totalFollowers !== null && summary.to) {
      let running = summary.totalFollowers;
      for (const date of [...dates].reverse()) {
        put.run(acc.id, "followers", date, running);
        running -= daily.get(date)?.gained ?? 0;
      }
    }
    const upsert = d.prepare(
      `INSERT INTO content (account_id, external_id, kind, format, published_at, url, caption, likes, comments, shares, saved, reach, views)
       VALUES (?, ?, 'post', 'POST', ?, ?, ?, ?, 0, 0, 0, ?, ?)
       ON CONFLICT(account_id, external_id) DO UPDATE SET likes=excluded.likes, reach=excluded.reach, views=excluded.views`
    );
    for (const [url, p] of posts) {
      const at = (p.date ?? summary.to ?? new Date().toISOString().slice(0, 10)) + "T09:00:00.000Z";
      upsert.run(acc.id, url, at, url, `LinkedIn post · ${url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}`, p.engagements ?? 0, p.impressions ?? 0, p.impressions ?? 0);
    }
    if (demo.length) {
      d.prepare(`DELETE FROM distributions WHERE account_id = ? AND metric IN (${summary.demographics.map(() => "?").join(",")})`).run(acc.id, ...summary.demographics);
      const ins = d.prepare("INSERT OR REPLACE INTO distributions (account_id, metric, label, value) VALUES (?, ?, ?, ?)");
      for (const x of demo) ins.run(acc.id, x.metric, x.label, x.value);
    }
    d.prepare("UPDATE accounts SET last_sync = datetime('now') WHERE id = ?").run(acc.id);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  if (!summary.totalFollowers) warnings.push("No total follower count found, so the follower line only shows daily new followers");
  void fileName;
  return summary;
}
