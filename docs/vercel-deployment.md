# Vercel deployment

Passenger uses three Vercel projects connected to the same repository. This keeps the Expo web app, public Next.js website, and operations dashboard independently deployable and gives each one its own domains and preview deployments.

## Mobile web app

Create a Vercel project from this repository with these settings:

- **Root Directory:** `apps/mobile`
- **Framework Preset:** Other
- **Build Command:** use the repository setting (`bun run vercel-build`)
- **Output Directory:** use the repository setting (`dist`)
- **Include source files outside of the Root Directory:** enabled

Add this environment variable to Production, Preview, and Development:

```dotenv
EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

The value is embedded into the browser bundle at build time. Use the same Convex deployment as the native app and redeploy after changing it. Do not put Convex deployment credentials, Paystack secrets, Mapbox tokens, or other server secrets in an `EXPO_PUBLIC_` variable.

`apps/mobile/vercel.json` exports the Expo app to `dist` and sends browser routes back to `index.html`, which is required for this single-page app. HTTPS on the deployed domain also allows browser camera and location permissions to work where the browser and device support them.

## Public website

Import the repository a second time as another Vercel project with these settings:

- **Root Directory:** `apps/website`
- **Framework Preset:** Next.js
- **Include source files outside of the Root Directory:** enabled

The website has no required environment variables at present. `apps/website/vercel.json` identifies it explicitly as a Next.js project, and Vercel supplies the standard build and output settings.

## Admin dashboard

Import the repository again as a third Vercel project with these settings:

- **Root Directory:** `apps/admin`
- **Framework Preset:** Next.js
- **Include source files outside of the Root Directory:** enabled

Add this environment variable to Production, Preview, and Development:

```dotenv
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

Use the same Convex deployment as the mobile web app. Administrator authorization is enforced by the backend using `ADMIN_USER_EMAILS` and team roles configured in Convex. Those values and all provider secrets belong in the Convex deployment environment, not in Vercel's public variables.

## Domains

Assign separate domains in each Vercel project's **Settings → Domains** area. A typical arrangement is:

- `app.example.com` for the mobile web app
- `www.example.com` or the apex domain for the public website
- `admin.example.com` for the operations dashboard

Add both deployed origins to any provider allowlists used by authentication, payments, or future browser integrations. Preview deployments use different origins, so configure preview-safe callbacks separately when a provider requires exact URLs.

## Local production checks

From the repository root:

```sh
bun run export:mobile
bun run build:website
bun run build:admin
```

The mobile export is written to `apps/mobile/dist`. The website and admin builds are written to their respective `.next` directories.
