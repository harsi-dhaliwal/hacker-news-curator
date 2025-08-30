import type { StoriesPage, StoryBase } from "@/types/api";
import StoryCard from "@/components/StoryCard";
import Filters from "@/components/Filters";
import SearchBox from "@/components/SearchBox";
import EmptyState from "@/components/EmptyState";

export const revalidate = 60;

async function fetchStories(name: string): Promise<StoriesPage> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/stories?domain=${encodeURIComponent(name)}`, {
    next: { revalidate },
  });
  if (!res.ok) throw new Error("failed_fetch");
  return res.json();
}

export default async function DomainPage({ params }: { params: { name: string } }) {
  const { items } = await fetchStories(params.name);
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Domain: {params.name}</h1>
        <SearchBox />
      </header>
      <Filters />
      <div className="mt-2 space-y-3">
        {items.length === 0 ? (
          <EmptyState message="No stories found for this domain." />
        ) : (
          items.map((s: StoryBase) => <StoryCard key={s.id} story={s} />)
        )}
      </div>
    </div>
  );
}

