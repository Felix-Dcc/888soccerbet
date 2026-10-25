import { destroySession } from "@/lib/session";
import { json, errorResponse } from "@/lib/http";

export async function POST() {
  try {
    await destroySession();
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
