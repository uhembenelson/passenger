# Passenger operations workspace

Live-only Next.js operations console. This app owns only `apps/admin` and consumes `@passenger/core` DTOs and the generated Convex API.

## Configuration

Copy `.env.example` to `.env.local` and supply the real public Convex URL and Clerk publishable key. Missing or invalid configuration displays a setup screen with no records. Configure Clerk's `convex` JWT template and the backend issuer. Rebuild after changing public environment values.

Authentication, profile onboarding, and server-allowlisted administrator authorization are required. Creating a profile never grants admin access. Never put Paystack, SMS, Clerk secret keys or private identity evidence into public environment variables.

## Commands

Install workspace dependencies from the repository root, then from this directory:

```sh
bun run dev
bun run typecheck
bun run build
bun run start
```

Node 22 is supported. Development and production commands use port 3000. No external fonts or map service are required.

## Operational safety

All records are queried from Convex and actions wait for server acknowledgement. The server remains authoritative for permissions, review eligibility, transitions, payment reconciliation, expiry and reservation capacity. The UI does not fabricate successful mutations. Error, offline, loading, empty and access-denied screens are explicit.

Never paste private identity documents, proof secrets, full bank details, or payment credentials into audit/review notes. Private evidence must be retrieved through authenticated backend access. Receiver SMS proof must never expose a readable code to operators or participants.

## Accessibility

Native dialogs contain focus and restore focus on close. Escape closes drawers; `/` focuses search outside form fields. Navigation focuses the page heading. Forms have labels, busy states, and live error/status feedback. Small screens use collapsible navigation and horizontally scrollable tables. Reduced-motion preferences are respected.
