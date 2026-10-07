import { ConvexHttpClient } from "convex/browser";
import { api } from "@passenger/backend/convex/_generated/api";

export async function POST(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!convexUrl) {
    console.error("Waitlist submission is unavailable because NEXT_PUBLIC_CONVEX_URL is missing.");
    return Response.json({ error: "The waitlist is temporarily unavailable." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Enter your waitlist details and try again." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Enter your waitlist details and try again." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (typeof record.name !== "string" || typeof record.email !== "string" || typeof record.state !== "string") {
    return Response.json({ error: "Enter your waitlist details and try again." }, { status: 400 });
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const result = await convex.action(api.waitlist.join, {
      name: record.name,
      email: record.email,
      state: record.state,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("Waitlist submission failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json(
      { error: "We could not add you right now. Please try again." },
      { status: 502 },
    );
  }
}
