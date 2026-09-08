import { notification } from "@/lib/server/billing";
import { failure } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    if (
      !request.headers
        .get("content-type")
        ?.includes("application/x-www-form-urlencoded")
    )
      return new Response("Expected form data", { status: 415 });
    const raw = await request.text();
    if (raw.length > 20000) return new Response("Too large", { status: 413 });
    // Every outcome PayFast can legitimately resend - including a duplicate
    // reference - is acknowledged, so the merchant stops retrying.
    const outcome = await notification(raw, request.headers.get("referer"));
    return new Response(`OK ${outcome}`);
  } catch (error) {
    return failure(error);
  }
}
