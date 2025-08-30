import type { StoriesPage, StoryBase } from "@/types/api";
import StoryCard from "@/components/StoryCard";
import Filters from "@/components/Filters";
import SearchBox from "@/components/SearchBox";
import EmptyState from "@/components/EmptyState";

export const revalidate = 60;

async function fetchStories(slug: string): Promise<StoriesPage> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/stories?topics=${encodeURIComponent(slug)}`, {
    next: { revalidate },
  });
  if (!res.ok) throw new Error("failed_fetch");
  return res.json();
}

export default async function TopicPage({ params }: { params: { slug: string } }) {
  const { items } = await fetchStories(params.slug);
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Topic: {params.slug}</h1>
        <SearchBox />
      </header>
      <Filters />
      <div className="mt-2 space-y-3">
        {items.length === 0 ? (
          <EmptyState message="No stories found for this topic." />
        ) : (
          items.map((s: StoryBase) => <StoryCard key={s.id} story={s} />)
        )}
      </div>
    </div>
  );
}

