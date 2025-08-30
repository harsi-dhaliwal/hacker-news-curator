import type { StoriesPage, StoryBase } from "@/types/api";
import StoryCard from "@/components/StoryCard";
import Filters from "@/components/Filters";
import EmptyState from "@/components/EmptyState";

export const revalidate = 60;

async function fetchStories(): Promise<StoriesPage> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/backend/stories`, {
    next: { revalidate },
  });
  if (!res.ok) throw new Error("failed_fetch");
  return res.json();
}

export default async function Home() {
  const { items } = await fetchStories();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Hot</h1>
      <Filters />
      <div className="space-y-3">
        {items.length === 0 ? (
          <EmptyState message="No stories yet." />
        ) : (
          items.map((s: StoryBase) => <StoryCard key={s.id} story={s} />)
        )}
      </div>
    </div>
  );
}
