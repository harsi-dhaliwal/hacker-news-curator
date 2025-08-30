import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { withCachingJSON, TTL } from "@/lib/caching";
import { listStories } from "@/lib/queries";

function parseArrayParam(val: string | string[] | undefined | null): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const tags = parseArrayParam(searchParams.get("tags"));
  const topics = parseArrayParam(searchParams.get("topics"));
  const domain = searchParams.get("domain");
  const sort = (searchParams.get("sort") as any) || "hot";
  const since = searchParams.get("since");
  const limit = clamp(parseInt(searchParams.get("limit") || "30", 10), 1, 100);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

  const db = getDb();
  const page = await listStories(db, { q, tags, topics, domain, sort, since, limit, offset });
  return withCachingJSON(page, TTL.FEED);
}

