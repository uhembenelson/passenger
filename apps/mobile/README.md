# Passenger mobile

Passenger is a single Expo SDK 57 app for senders and travellers. React Native screens use the shared Convex deployment for authentication, profiles, trips, parcel review, offers, wallet holds, milestone proofs, messaging, notifications, disputes, and reviews. There is no production demo fallback and no simulated success state.

## Run

From the workspace root:

```sh
bun run dev:mobile
```

Or from this directory:

```sh
bun run web
bun run ios
bun run android
```

Set the shared backend URL in `apps/mobile/.env.local`:

```dotenv
EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

Authentication is provided by `@convex-dev/auth` inside the Passenger Convex backend. The mobile app does not need Clerk configuration. Native sessions are stored with Expo SecureStore; browser sessions use local storage.

Do not use `localhost` or `127.0.0.1` as the backend hostname on a physical device. Use the Convex cloud URL or a network address reachable by the device. Restart Expo after changing the environment.

## Live workflow

- A member creates an account, verifies their phone, and submits private identity evidence.
- Operations reviews identity evidence before the member may publish a parcel or trip.
- Senders fund the real wallet, submit parcel details and evidence, and wait for parcel review.
- Travellers publish complete routes and send offers from compatible trips.
- The sender accepts an offer; the backend reserves capacity and retains the wallet hold.
- Separate expiring codes confirm physical handover and receiver delivery.
- Milestones, location check-ins, messages, notifications, disputes, reviews, and provider-confirmed finance updates all come from Convex.

The app never invents payment, transfer, verification, booking, message, or tracking success. If Paystack or Twilio is not configured on the deployment, the affected action fails closed with a visible explanation.

## Validate

```sh
bun run --filter @passenger/mobile typecheck
bun run export:mobile
```

The web export is written to `apps/mobile/dist`. A successful export verifies bundling; staging still needs real-device checks against the deployed Convex, Paystack, and Twilio configuration.

## Parcel maps

Configure `MAPBOX_ACCESS_TOKEN` in the Convex deployment environment through the dashboard or `convex env set`. No Mapbox credential belongs in the mobile environment or bundle. The authenticated `deliveries.parcelMap` action checks shipment participation, performs city lookup and routing, and returns the rendered PNG as a data URI. Mapbox URLs and tokens never reach the client. Enable Static Images, Geocoding and Directions access for the Mapbox account; requests originate from Convex, so browser-origin URL restrictions are not applicable.

The tracking screen uses Mapbox Static Images on web, iOS and Android, with built-in Mapbox attribution retained. It is an overview map, without pan or zoom controls. Pickup and destination use temporary Nigeria city geocoding results; they are approximate city locations, not exact meeting points. Geocoding results are held only for the backend request. The suggested driving route is separate from the last GPS check-in marker and is not a recorded travel path. If directions fail, a labelled straight connection between the cities is shown. Maps refresh when the shipment's reported coordinates change. Without a token or when Mapbox fails, text tracking remains available.
