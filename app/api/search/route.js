import { NextResponse } from "next/server";
import { searchFeed } from "../../../lib/search.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const q = new URL(req.url).searchParams.get("q") || "";
  const result = await searchFeed(q);
  return NextResponse.json(result);
}
