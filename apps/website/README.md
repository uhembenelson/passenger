# @passenger/website

Public marketing website for Passenger — the peer-to-peer delivery platform.

## Features

- **Next.js 16 App Router**
- **Tailwind CSS v4** & **shadcn/ui** components
- **Direct integration with `@passenger/design-tokens`**
- **Interactive Delivery Cost & Traveller Earning Estimator** utilizing `@passenger/core` pricing rules and Nigerian city routes
- Responsive landing experience for Senders, Travellers, and Trust & Safety overview

## Development

```sh
bun run dev:website
```

Runs on `http://localhost:3001`.

## Deploy

Create a Vercel project with `apps/website` as its Root Directory and enable access to source files outside that directory for the shared workspace packages. The checked-in `vercel.json` selects the Next.js framework preset. No environment variables are currently required by the website.

See [`../../docs/vercel-deployment.md`](../../docs/vercel-deployment.md) for domains and the complete monorepo setup.
