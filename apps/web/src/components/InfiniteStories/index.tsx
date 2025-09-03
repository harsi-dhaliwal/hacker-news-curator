"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoriesPage, StoryBase } from "@/types/api";
import StoryCard from "@/components/StoryCard";

export default function InfiniteStories({ initial }: { initial: StoriesPage }) {
  const [items, setItems] = useState<StoryBase[]>(initial.items || []);
  const [nextOffset, setNextOffset] = useState<number | null>(initial.next_offset ?? null);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || nextOffset == null) return;
    setLoading(true);
    try {
      const base = process.env.NEXT_PUBLIC_BASE_URL || "";
      const res = await fetch(`${base}/backend/stories?offset=${nextOffset}`, { cache: "no-store" });
      if (res.ok) {
        const data: StoriesPage = await res.json();
        setItems((prev) => [...prev, ...(data.items || [])]);
        setNextOffset(data.next_offset ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [loading, nextOffset]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e.isIntersecting) {
        loadMore().catch(() => {});
      }
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <div className="columns-1 gap-4 md:columns-2">
      {items.map((s) => {
        const latestSummary = Array.isArray(s.summaries) && s.summaries.length > 0 ? s.summaries[0]?.summary : undefined;
        return (
          <div key={s.id} className="mb-4 break-inside-avoid">
            <StoryCard story={s} summaryFull={latestSummary} summarySnippet={s.summary_snippet} variant="small" />
          </div>
        );
      })}
      <div ref={sentinelRef} className="mb-4 break-inside-avoid" />
      {loading && <div className="mb-4 break-inside-avoid py-2 text-center text-xs text-gray-500">Loading…</div>}
      {nextOffset == null && !loading && (
        <div className="mb-4 break-inside-avoid py-2 text-center text-xs text-gray-400">— End —</div>
      )}
    </div>
  );
}
