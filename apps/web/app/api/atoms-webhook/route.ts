import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verify(rawBody: string, headers: Headers, secret: string) {
  const timestamp = headers.get("webhook-timestamp") || "";
  if (!timestamp) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const signature = headers.get("webhook-signature") || "";

  return signature
    .split(",")
    .filter((part) => part.startsWith("v1="))
    .some((part) => {
      const given = Buffer.from(part.slice(3), "hex");
      const wanted = Buffer.from(expected, "hex");
      return (
        given.length === wanted.length &&
        crypto.timingSafeEqual(given, wanted)
      );
    });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret = process.env.ATOMS_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "ATOMS_WEBHOOK_SECRET is not set" },
      { status: 500 }
    );
  }

  if (!verify(rawBody, req.headers, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const eventId = req.headers.get("webhook-id") || event.id;
  const eventType = event.metadata?.eventType;
  const callId = event.metadata?.callId;

  console.log("atoms.webhook", { eventId, eventType, callId });

  // TODO: persist `event` here. See Step 7.

  return NextResponse.json({ received: true, eventId });
}
