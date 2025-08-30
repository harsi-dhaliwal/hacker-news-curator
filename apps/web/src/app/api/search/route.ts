import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { withCachingJSON, TTL } from "@/lib/caching";
import { searchLexical } from "@/lib/queries";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const k = clamp(parseInt(searchParams.get("k") || "30", 10), 1, 100);
  if (!q) return withCachingJSON({ items: [] }, TTL.SEARCH);
  const db = getDb();
  const results = await searchLexical(db, q, k);
  return withCachingJSON(results, TTL.SEARCH);
}

