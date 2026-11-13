// Server component: Connect button for OAuth networks, or step-by-step setup when the app keys are missing.

const GUIDES: Record<string, { steps: string[]; note?: string }> = {
  google: {
    steps: [
      "Go to console.cloud.google.com, create a project (e.g. “Socialdesk”).",
      "APIs & Services → Library: enable “YouTube Data API v3” and “YouTube Analytics API”.",
      "OAuth consent screen: User type External, add your Google account as a Test user, and add the scopes youtube.readonly, yt-analytics.readonly, youtube.upload.",
      "Credentials → Create credentials → OAuth client ID → Web application. Add the redirect URI below.",
      "Copy the Client ID and Client secret into web/.env.local as GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then restart the app.",
    ],
    note: "While the consent screen is in Testing, Google expires the connection after 7 days and you'll need to reconnect; publish the app (no review needed for your own channels' read scopes) to stop that. Videos uploaded through an unverified Google project are locked to Private until Google audits the project.",
  },
  linkedin: {
    steps: [
      "Go to linkedin.com/developers/apps → Create app (a LinkedIn Company Page is required to create one; any page you admin works).",
      "Products tab: add “Sign In with LinkedIn using OpenID Connect” and “Share on LinkedIn” (both self-serve).",
      "Auth tab: add the redirect URI below.",
      "Copy the Client ID and Primary Client Secret into web/.env.local as LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET, then restart the app.",
    ],
    note: "This connects your personal profile for posting. LinkedIn tokens last 60 days and then need a reconnect. Company Page posting and analytics need the Community Management API, which LinkedIn reviews before granting.",
  },
  x: {
    steps: [
      "Go to developer.x.com → sign up for the Free tier and open your Project's App.",
      "User authentication settings → Set up: App permissions “Read and write”, Type of App “Web App, Automated App or Bot”, add the redirect URI below and a website URL.",
      "Keys and tokens → OAuth 2.0 Client ID and Client Secret: copy them into web/.env.local as X_CLIENT_ID and X_CLIENT_SECRET, then restart the app.",
    ],
    note: "The Free tier lets you post. Reading follower counts and post metrics is very limited on Free (a few calls per day); the paid Basic tier is needed for regular analytics.",
  },
};

export function OAuthSetup({ provider, label, configured, redirectUri, envNames }: { provider: string; label: string; configured: boolean; redirectUri: string; envNames: [string, string] }) {
  const g = GUIDES[provider];
  if (configured)
    return (
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <a href={`/api/oauth/${provider}/start`} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">Connect with {label}</a>
        {g.note && <span className="text-xs text-muted">{g.note}</span>}
      </div>
    );
  return (
    <details className="mt-2 text-xs text-muted">
      <summary className="cursor-pointer"><span className="font-medium text-ink">Set up {label} (one time, ~10 minutes)</span>: needs {envNames[0]} and {envNames[1]} in web/.env.local</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      <p className="mt-2">Redirect URI: <code className="select-all rounded bg-bg px-1.5 py-0.5 text-ink">{redirectUri}</code></p>
      {g.note && <p className="mt-2">{g.note}</p>}
    </details>
  );
}
