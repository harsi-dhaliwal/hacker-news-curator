import type { SearchResults } from "@/types/api";
import StoryCard from "@/components/StoryCard";
import SearchBox from "@/components/SearchBox";
import EmptyState from "@/components/EmptyState";

export const revalidate = 60;

async function fetchResults(q: string, k: number): Promise<SearchResults> {
  if (!q) return { items: [] };
  const base = process.env.NEXT_PUBLIC_BASE_URL || "";
  const res = await fetch(`${base}/backend/search?q=${encodeURIComponent(q)}&k=${k}`, { next: { revalidate } });
  if (!res.ok) throw new Error("failed_fetch");
  return res.json();
}

export default async function SearchPage({ searchParams }: { searchParams: { q?: string; k?: string } }) {
  const q = (searchParams.q || "").trim();
  const k = Math.max(1, Math.min(100, parseInt(searchParams.k || "30", 10)));
  const { items } = await fetchResults(q, k);
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Search</h1>
        <SearchBox />
      </header>
      <div className="mt-2 space-y-3">
        {!q ? (
          <EmptyState message="Type a query to search stories." />
        ) : items.length === 0 ? (
          <EmptyState message="No results for this query." />
        ) : (
          items.map((r) => (
            <div key={r.story.id} className="space-y-1">
              <StoryCard story={r.story} />
              <div className="text-xs text-gray-500">match: {r.match} • score: {r.score.toFixed(3)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

