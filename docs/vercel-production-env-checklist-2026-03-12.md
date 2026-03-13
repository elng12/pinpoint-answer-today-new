# Vercel Production Env Checklist (2026-03-12)

This checklist is for the new English-only site in `new-pinpoint-site/`.

The goal is simple:

- make production builds stable
- keep sitemap/metadata pointing at the right domain
- make contact form delivery real instead of fake success

## 1. Minimum Production Set

These are the production variables that should be configured before launch.

| Variable | Required | Example | Why it matters |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Yes | `https://pinpointanswertoday.app` | Drives canonical URLs, sitemap URLs, robots sitemap URL, and metadata base. |
| `REVALIDATE_SECRET` | Yes | a long random string | Protects `/api/revalidate`. Must match the caller that triggers on-demand refresh. |
| `FEEDBACK_WEBHOOK_URL` or fallback webhook vars | Yes | `https://example.com/webhooks/new-site-feedback` | Without a delivery endpoint, `/api/feedback` now returns `503` on purpose. |

## 2. Contact Form Delivery Options

Use one of the two options below.

### Option A: Dedicated feedback webhook (recommended)

Set:

- `FEEDBACK_WEBHOOK_URL`
- `FEEDBACK_WEBHOOK_SECRET` (optional but recommended)

Behavior:

- The site sends a JSON payload to your endpoint.
- If `FEEDBACK_WEBHOOK_SECRET` is set, it is sent as `x-webhook-secret`.

Payload shape:

```json
{
  "source": "pinpointanswertoday.app/contact-us",
  "receivedAt": "2026-03-12T13:32:58.178Z",
  "feedback": {
    "name": "Tester",
    "email": "tester@example.com",
    "phone": "",
    "puzzleNumber": 681,
    "message": "Archive card spacing looks off."
  }
}
```

### Option B: Reuse existing notification channels

If `FEEDBACK_WEBHOOK_URL` is empty, the site automatically falls back to:

- `FEISHU_WEBHOOK_URL`
- `SLACK_WEBHOOK_URL`
- `ALERT_WEBHOOK_URL`

Behavior:

- Feishu/Lark URLs receive a native Feishu text payload.
- Slack URLs receive a native Slack text payload.
- Duplicate URLs are de-duplicated.

Recommended fallback choice:

- If your old production setup already has `FEISHU_WEBHOOK_URL` or `SLACK_WEBHOOK_URL`, you can reuse it immediately.
- If you want cleaner routing and future storage, move to `FEEDBACK_WEBHOOK_URL`.

## 3. Production-Useful Optional Vars

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_ENABLE_GA` | Optional | `true` | Enables GA client scripts. Leave `false` if analytics is not ready. |
| `NEXT_PUBLIC_GA_ID` | Optional | `G-XXXXXXXXXX` | Needed only when `NEXT_PUBLIC_ENABLE_GA=true`. |
| `GITHUB_RAW_BASE` | Optional | `https://raw.githubusercontent.com/elng12/pinpoint-answer-today-new/main` | Usually leave blank. Override only if the content repo or branch changes. |

## 4. Cross-System Value Matching

These values need to stay aligned with existing systems.

### `REVALIDATE_SECRET`

This should match the secret used by the caller of the new site's revalidate endpoint.

If the old worker is responsible for post-publish refresh, then:

- Vercel env on the new site uses `REVALIDATE_SECRET`
- worker env uses `NEW_SITE_REVALIDATE_SECRET`

Those two values must be identical.

### `NEXT_PUBLIC_SITE_URL`

For production, use the real canonical domain only:

- `https://pinpointanswertoday.app`

Do not point production to a preview URL.

## 5. Recommended Vercel Production Values

Use this as the practical baseline:

```env
NEXT_PUBLIC_SITE_URL=https://pinpointanswertoday.app
REVALIDATE_SECRET=<same secret used by the publisher/worker>

# pick one approach below
FEEDBACK_WEBHOOK_URL=<dedicated feedback webhook>
FEEDBACK_WEBHOOK_SECRET=<optional shared secret>

# or reuse old channels instead
# FEISHU_WEBHOOK_URL=<existing feishu bot webhook>
# SLACK_WEBHOOK_URL=<existing slack webhook>
# ALERT_WEBHOOK_URL=<legacy webhook if still in use>

NEXT_PUBLIC_ENABLE_GA=false
NEXT_PUBLIC_GA_ID=
```

## 6. What Happens If You Skip One

- Missing `NEXT_PUBLIC_SITE_URL`: production pages still render, but canonical/sitemap/robots can point to the wrong base URL.
- Missing `REVALIDATE_SECRET`: `/api/revalidate` cannot be safely used by automation.
- Missing feedback delivery vars: contact form returns `503` and tells the user to email support directly.
- Missing GA vars: no analytics, but site still works.
- Missing `GITHUB_RAW_BASE`: safe, because the default raw GitHub URL is already hardcoded.

## 7. Quick Post-Setup Checks

After saving env vars in Vercel production:

1. Redeploy the new site.
2. Open `/sitemap.xml` and confirm URLs use `https://pinpointanswertoday.app`.
3. Submit a test message on `/contact-us`.
4. Confirm the webhook or notification channel actually receives it.
5. Trigger `/api/revalidate` from the expected caller and confirm it returns `200`.

## 8. Current Code Paths That Read These Vars

- `NEXT_PUBLIC_SITE_URL`
  - `app/robots.ts`
  - `app/sitemap.ts`
  - `lib/seo/metadata.ts`
- `REVALIDATE_SECRET`
  - `app/api/revalidate/route.ts`
- `FEEDBACK_WEBHOOK_URL`
  - `app/api/feedback/route.ts`
- `FEISHU_WEBHOOK_URL`
  - `app/api/feedback/route.ts`
- `SLACK_WEBHOOK_URL`
  - `app/api/feedback/route.ts`
- `ALERT_WEBHOOK_URL`
  - `app/api/feedback/route.ts`
- `NEXT_PUBLIC_ENABLE_GA`
  - `components/analytics/AnalyticsScripts.tsx`
- `NEXT_PUBLIC_GA_ID`
  - `components/analytics/AnalyticsScripts.tsx`
- `GITHUB_RAW_BASE`
  - `lib/puzzles/data.ts`
