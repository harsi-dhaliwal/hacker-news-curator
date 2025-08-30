import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const TTL = {
  FEED: 60, // seconds
  SEARCH: 60,
};

export function buildKey(parts: (string | number | null | undefined)[]): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== "").join(":");
}

export function etag(body: unknown): string {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  return crypto.createHash("sha1").update(json).digest("hex");
}

export function withCachingJSON(data: unknown, ttlSeconds: number) {
  const tag = etag(data);
  const res = NextResponse.json(data);
  res.headers.set("ETag", tag);
  res.headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
  return res;
}

