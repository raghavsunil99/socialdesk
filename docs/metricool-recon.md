# How Metricool works (teardown for our own build)

Observed 2026-11-13. Sources: the public site (`metricool.com`, its `llms.txt` and pricing page), the app shell and 622 JS chunks from `app.metricool.com`, and a read-only walk through our own logged-in account (Analytics → Instagram, Planner) in the built-in browser, reading the API calls the app made. Nothing was posted or changed.

Legend: **O** = observed · **I** = inferred · **?** = unknown

## 1. Architecture

| Layer | What it is | Basis |
|---|---|---|
| Marketing site | WordPress (Yoast SEO, LiteSpeed cache) behind Cloudflare | O |
| Web app | Single-page app at `app.metricool.com`, built with Vite (hashed `app-*.js` entry + ~620 lazy chunks), static files on `static.metricool.com/app-static-content/versions/<build>/` | O |
| API | Same origin: `app.metricool.com/api/...` (older `api/*` and newer `api/v2/*`). Every call carries `userId` and `blogId` (= brand id) as query params | O |
| Auth | Cookie session; `POST /api/v2/settings/users/tokens` mints a token on load; `GET /api/v2/authorization/authorities` returns permissions | O |
| Feature flags | `GET /api/v2/features/check/<FLAG>` (e.g. `INBOX_V2`, `FLOWS`, `BRAND_TAGS`, `TABLE_INSIGHTS`) | O |
| Timezone | Stored per brand (`Asia/Calcutta` for us); every analytics/planner query passes `timezone` | O |
| Mobile | iOS + Android apps | O |
| Integrations | MCP server for Claude, Zapier/Make API, Looker Studio connector, Google Drive, Canva | O (site) |

## 2. Core data model

- **User** → owns many **brands** (Metricool calls them `blog`/`profile`). `GET /api/admin/simpleProfiles` lists them.
- A **brand** holds one connection slot per network: `instagram`, `facebookPageId`, `youtube`, `tiktok`, `linkedinCompany`, `twitter`, `threads`, `bluesky`, `pinterest`, `gmb`, `twitch`, plus ads accounts (`facebookAds`, `adwords`, `tiktokads`). It also stores timezone, picture and white-label fields. **O**
- Paid plans charge by the number of brands. **O**

## 3. Analytics engine (the heart of the product)

Analytics doesn't have a separate endpoint per chart. One generic metric API is parameterised by `network`, `subject` and `metric`: **O**

| Endpoint | Returns | Example |
|---|---|---|
| `GET /api/v2/analytics/timelines?metric&network&subject&from&to&timezone` | `{data:[{metric, values:[{dateTime, value}]}]}` daily series | `metric=followers&subject=account`, `metric=reach&subject=reels` |
| `GET /api/v2/analytics/aggregation?...` | one number for the period | `metric=engagement&subject=posts` |
| `GET /api/v2/analytics/distribution?metric=age\|gender\|country\|city&network&subject=account` | audience breakdown | demographics cards |
| `GET /api/v2/analytics/posts/{network}?from&to` | per-post rows: `type, publishedAt, url, content, imageUrl, likes, comments, shares, saved, reach, views, interactions, engagement, follows` | posts table |
| `GET /api/v2/analytics/reels/{network}` | same for reels | reels table |
| `GET /api/v2/analytics/posts/{network}/hashtags` | per-hashtag views, post count, likes, comments | hashtag table |
| `GET /api/v2/analytics/catalogs/{network}/scopes` | which metrics exist for that network | drives the UI |

Metrics we saw for Instagram:
- `subject=account`: `followers`, `friends`, `postsCount`, `followers_gained`, `followers_lost`, `views`, `reach`, `profile_views`
- `subject=posts|reels`: `count`, `engagement`, `interactions`, `reach`, `views`, `likes`, `comments`, `saved`, `shares`

**Engagement** = interactions ÷ reach × 100 (matches the rows: 16 / 1442 = 1.11 %). **O**

The page always asks for the same window shifted back one period for the "comparison" view. The free plan gets a 400 for anything older than 30 days. **O**

**I:** Metricool snapshots each connected account daily (the series timestamps are all noon, server time `Europe/Madrid`) and keeps its own history. That is why history only starts on the day you connect, and why it can sell "unlimited history".

Analytics sections in the sidebar: Brand summary, one page per connected network, Reporting/Studio, Reports, Hashtag tracker, Settings. Top bar: **Analytics · Reporting · Inbox · Planning · SmartLinks · Ads**. **O**

## 4. Planner

| Endpoint | Purpose |
|---|---|
| `GET /api/v2/scheduler/posts?start&end&timezone&extendedRange` | posts in the visible calendar range |
| `GET /api/v2/scheduler/besttimes/{network}?start&end&timezone` | 7 days × 24 hours heat-map (`dayOfWeek`, `hourOfDay`, `value`), shaded behind the calendar |
| `GET /api/v2/scheduler/counters`, `/scheduler/tasks/{user}/counters` | monthly post quota (free plan: 20 posts/month) and approval tasks |
| `GET /api/v2/scheduler/calendars/assigned`, `/notifications-config` | team calendars and reminders |

**I:** "Best times" is computed from when your audience is online (the values look like follower-online counts per hour), not from your own post results.

Publishing to the networks happens server-side at the scheduled time through each network's official API. **I** (standard for this category; we didn't trigger a publish).

## 5. Everything else (from the site and nav)

- **Inbox:** comments and DMs from all networks in one place
- **SmartLinks:** link-in-bio pages
- **Competitors:** track public accounts
- **Hashtag tracker**
- **Reports:** PDF/PPT, scheduled
- **Studio:** AI report builder
- **Campaign dashboards**
- **Ads:** Meta, Google and TikTok ads analytics
- **Approval flows** for teams
- **AI assistant** for captions

## 6. What this means for our build

1. **The data has to come from official APIs.** For Instagram that's the Instagram Graph API (Business/Creator account linked to a Facebook Page): account insights (`reach`, `views`, `follower_count`, `profile_views`), media insights, audience demographics, and content publishing (`/media` + `/media_publish`). YouTube uses the Data API + Analytics API.
2. **Keep our own daily snapshots.** Store the series ourselves, so history grows from the day we connect, exactly like Metricool.
3. **Copy the generic metric API shape** (`timelines / aggregation / distribution` by `network + subject + metric`). One chart component then works for every network.
4. **Network access needs a Meta developer app** with `instagram_basic`, `instagram_manage_insights`, `instagram_content_publish` and `pages_read_engagement`. For our own accounts, Meta's development mode is enough, with no app review.
