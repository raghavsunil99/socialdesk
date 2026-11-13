import type { DatabaseSync } from "node:sqlite";

// Deterministic demo data so the app is usable before any network is connected.
// Shapes and magnitudes mirror what the real Instagram account showed in Metricool.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS = 120;

const HOUR_CURVE = [
  0.09, 0.06, 0.04, 0.03, 0.04, 0.08, 0.17, 0.33, 0.57, 0.8, 1.0, 0.92, 0.9, 0.68, 0.66, 0.69, 0.69,
  0.74, 0.78, 0.65, 0.47, 0.28, 0.17, 0.12,
];
const DOW_FACTOR = [0, 0.85, 0.75, 1.0, 0.95, 1.0, 0.5, 0.42]; // index 1..7 = Mon..Sun

const TOPICS = [
  "Excel formulas every Data Analyst must know – save this cheat sheet",
  "Data & AI career roles explained: skills, tools, salary in India",
  "Python in 30 days roadmap for absolute beginners",
  "SQL interview questions asked at product companies",
  "Power BI vs Tableau – which one should freshers learn?",
  "5 free certifications to add to your resume this month",
  "How I cracked my first Data Analyst job from a non-IT background",
  "GenAI engineer roadmap: what to learn first",
  "Student ambassador programs open right now (Google, OnePlus, Myntra)",
  "Machine Learning project ideas for your final year",
  "Full Stack vs Data Science – honest comparison",
  "Top 10 VS Code shortcuts that save hours",
  "Prompt engineering basics for students",
  "Mock interview: HR round questions and answers",
];
const HASHTAGS = [
  "#dataanalytics", "#datascience", "#python", "#excel", "#careers", "#telugu", "#genai",
  "#machinelearning", "#sql", "#jobs", "#students", "#entri",
];

type Profile = {
  network: string;
  handle: string;
  followers: number;
  gain: number;
  loss: number;
  reach: number;
  postsPerWeek: number;
  reelsPerWeek: number;
  kindMain: "post" | "video";
};

const PROFILES: Omit<Profile, "handle">[] = [
  { network: "instagram", followers: 40500, gain: 160, loss: 55, reach: 100000, postsPerWeek: 2.5, reelsPerWeek: 4, kindMain: "post" },
  { network: "youtube", followers: 118000, gain: 210, loss: 40, reach: 60000, postsPerWeek: 3, reelsPerWeek: 5, kindMain: "video" },
  { network: "facebook", followers: 15200, gain: 25, loss: 9, reach: 9000, postsPerWeek: 4, reelsPerWeek: 2, kindMain: "post" },
  { network: "tiktok", followers: 7800, gain: 30, loss: 8, reach: 12000, postsPerWeek: 0, reelsPerWeek: 5, kindMain: "video" },
  { network: "x", followers: 5200, gain: 12, loss: 6, reach: 6000, postsPerWeek: 7, reelsPerWeek: 0, kindMain: "post" },
  { network: "linkedin", followers: 3100, gain: 9, loss: 2, reach: 2500, postsPerWeek: 3, reelsPerWeek: 0, kindMain: "post" },
];

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function slugify(name: string, sep = "-") {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}+|\\${sep}+$`, "g"), "").slice(0, 40) || "brand";
}

/** First start: the two brands we manage today. Entri gets demo data; raghavTalkz starts empty. */
export function seedDemo(d: DatabaseSync) {
  createBrand(d, "Entri Coding Telugu", "Asia/Kolkata", true);
  createBrand(d, "raghavTalkz", "Asia/Kolkata", false);
}

/** Create a brand with its own link-in-bio page; optionally fill it with demo data. Returns the brand id. */
export function createBrand(d: DatabaseSync, name: string, timezone: string, withDemo: boolean, ownerId?: number) {
  d.exec("BEGIN");
  try {
    const id = Number(d.prepare("INSERT INTO brands (name, timezone) VALUES (?, ?)").run(name, timezone).lastInsertRowid);
    let slug = slugify(name);
    if (d.prepare("SELECT 1 FROM smartlinks WHERE slug = ?").get(slug)) slug = `${slug}-${id}`;
    d.prepare("INSERT INTO smartlinks (brand_id, slug, title, bio, buttons) VALUES (?, ?, ?, '', '[]')").run(id, slug, name);
    if (ownerId) d.prepare("INSERT INTO brand_members (brand_id, user_id, role) VALUES (?, ?, 'owner')").run(id, ownerId);
    if (withDemo) seedBrandDemo(d, id, name);
    d.exec("COMMIT");
    return id;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

/** Demo accounts for every network the brand hasn't connected yet. Call inside a transaction. */
export function seedBrandDemo(d: DatabaseSync, brandId: number, name: string) {
  const r = rng(brandId * 7919 + 42);
  const scale = brandId === 1 ? 1 : 0.15 + r() * 0.6;
  const handleFor = (network: string) => (network === "instagram" || network === "tiktok" || network === "x" ? slugify(name, network === "instagram" ? "_" : "") : name);
  {
    d.prepare("DELETE FROM accounts WHERE brand_id = ? AND connector = 'none'").run(brandId);
    const insAcc = d.prepare("INSERT OR IGNORE INTO accounts (brand_id, network, handle, connector) VALUES (?, ?, ?, 'demo')");
    const insPt = d.prepare("INSERT OR REPLACE INTO metric_points (account_id, subject, metric, date, value) VALUES (?, 'account', ?, ?, ?)");
    const insContent = d.prepare(
      `INSERT INTO content (account_id, external_id, kind, format, published_at, url, caption, likes, comments, shares, saved, reach, views)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insBest = d.prepare("INSERT INTO best_times (account_id, dow, hour, value) VALUES (?, ?, ?, ?)");
    const insDist = d.prepare("INSERT INTO distributions (account_id, metric, label, value) VALUES (?, ?, ?, ?)");

    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);

    for (const base of PROFILES) {
      const p: Profile = { ...base, handle: handleFor(base.network), followers: Math.round(base.followers * scale), gain: Math.max(1, Math.round(base.gain * scale)), loss: Math.max(1, Math.round(base.loss * scale)), reach: Math.round(base.reach * scale) };
      const res = insAcc.run(brandId, p.network, p.handle);
      if (res.changes === 0) continue; // network already connected (live) for this brand
      const accId = Number(res.lastInsertRowid);
      let followers = p.followers;
      let postsCount = 300;
      for (let i = DAYS; i >= 0; i--) {
        const day = new Date(today.getTime() - i * 86400000);
        const dow = ((day.getUTCDay() + 6) % 7) + 1;
        const wave = 0.75 + 0.5 * r() * DOW_FACTOR[dow];
        const gained = Math.round(p.gain * wave);
        const lost = Math.round(p.loss * (0.7 + 0.6 * r()));
        followers += gained - lost;
        const reach = Math.round(p.reach * (0.6 + 0.8 * r()) * DOW_FACTOR[dow] + p.reach * 0.2);
        const date = ymd(day);
        insPt.run(accId, "followers", date, followers);
        insPt.run(accId, "followers_gained", date, gained);
        insPt.run(accId, "followers_lost", date, lost);
        insPt.run(accId, "reach", date, reach);
        insPt.run(accId, "views", date, Math.round(reach * (1.3 + 0.4 * r())));
        insPt.run(accId, "profile_views", date, Math.round(reach * 0.012 * (0.7 + 0.6 * r())));
        insPt.run(accId, "following", date, 14);
        // content for the day
        const make = (kind: "post" | "reel" | "video", perWeek: number) => {
          if (perWeek <= 0 || r() > perWeek / 7) return;
          const hour = [10, 11, 12, 18, 19, 20][Math.floor(r() * 6)];
          const at = new Date(day);
          at.setUTCHours(hour - 5, Math.floor(r() * 59), 0, 0); // IST -> UTC
          if (at.getTime() > Date.now()) return; // nothing "published" in the future
          const reachC = Math.round((kind === "reel" ? 4200 : 1800) * (0.4 + 1.6 * r() ** 2));
          const views = Math.round(reachC * (kind === "reel" ? 2.2 : 3.0));
          const likes = Math.round(reachC * (0.006 + 0.02 * r()));
          const comments = Math.round(likes * (0.15 + 0.5 * r()));
          const saved = Math.round(likes * (0.2 + 0.9 * r()));
          const shares = Math.round(likes * (kind === "reel" ? 0.4 : 0.1) * r());
          const topic = TOPICS[Math.floor(r() * TOPICS.length)];
          const tags = [0, 1, 2].map(() => HASHTAGS[Math.floor(r() * HASHTAGS.length)]);
          const ext = `${p.network}-${kind}-${date}-${hour}`;
          postsCount++;
          insContent.run(
            accId, ext, kind,
            kind === "post" ? (r() > 0.3 ? "CAROUSEL" : "IMAGE") : "VIDEO",
            at.toISOString(), null,
            `${topic}\n\n💬 Comment "LINK" for course details.\n\n${[...new Set(tags)].join(" ")}`,
            likes, comments, shares, saved, reachC, views
          );
        };
        make(p.kindMain, p.postsPerWeek);
        make(p.network === "youtube" ? "reel" : "reel", p.reelsPerWeek);
        insPt.run(accId, "postsCount", date, postsCount);
      }
      for (let dow = 1; dow <= 7; dow++)
        for (let h = 0; h < 24; h++)
          insBest.run(accId, dow, h, Math.round(p.reach * 0.06 * HOUR_CURVE[h] * DOW_FACTOR[dow] * (0.9 + 0.2 * r())));

      const dist: Record<string, [string, number][]> = {
        gender: [["Male", 78], ["Female", 19], ["Unknown", 3]],
        age: [["13-17", 6], ["18-24", 58], ["25-34", 28], ["35-44", 6], ["45+", 2]],
        country: [["India", 91.2], ["United States", 2.1], ["Pakistan", 1.1], ["United Arab Emirates", 1.0], ["Others", 4.6]],
        city: [["Hyderabad", 7.7], ["Bangalore", 6.0], ["Visakhapatnam", 3.4], ["Vijayawada", 2.8], ["Chennai", 2.0], ["Guntur", 1.0], ["Nellore", 1.0], ["Tirupati", 1.0], ["Warangal", 0.7], ["Others", 74.4]],
      };
      for (const [metric, rows] of Object.entries(dist))
        for (const [label, v] of rows) insDist.run(accId, metric, label, v);
    }

    const insComp = d.prepare(
      "INSERT INTO competitors (brand_id, network, handle, followers, followers_30d_ago, posts_30d, avg_engagement, avg_reach, updated_at) VALUES (?, 'instagram', ?, ?, ?, ?, ?, ?, datetime('now'))"
    );
    insComp.run(brandId, "demo_competitor_one", Math.round(212000 * scale), Math.round(204500 * scale), 34, 0.21, 8400);
    insComp.run(brandId, "demo_competitor_two", Math.round(86000 * scale), Math.round(84900 * scale), 22, 0.34, 5100);
    insComp.run(brandId, "demo_competitor_three", Math.round(54000 * scale), Math.round(50200 * scale), 41, 0.52, 4300);

    d.prepare("UPDATE smartlinks SET bio = 'Learn something new every week 🚀', buttons = ? WHERE brand_id = ? AND buttons = '[]'").run(
      JSON.stringify([
        { label: "🌐 Website", url: "https://example.com/", clicks: 0 },
        { label: "▶️ YouTube channel", url: "https://www.youtube.com/", clicks: 0 },
      ]),
      brandId
    );

    const insSched = d.prepare("INSERT INTO scheduled_posts (brand_id, networks, text, scheduled_at, status) VALUES (?, ?, ?, ?, ?)");
    const base = new Date();
    base.setUTCMinutes(0, 0, 0);
    insSched.run(brandId, '["instagram","facebook"]', "SQL JOINs explained with one picture 🧩 Save it for your interview prep! #sql #dataanalytics", new Date(base.getTime() + 26 * 3600e3).toISOString(), "scheduled");
    insSched.run(brandId, '["instagram"]', "Reel: 3 Excel tricks in 30 seconds ⚡ #excel #exceltips", new Date(base.getTime() + 50 * 3600e3).toISOString(), "pending_approval");
    insSched.run(brandId, '["linkedin"]', "We're hiring content creators. DM us!", new Date(base.getTime() + 74 * 3600e3).toISOString(), "draft");
  }
}
