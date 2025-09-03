import type { StoriesPage } from "@/types/api";
import InfiniteStories from "@/components/InfiniteStories";

export const revalidate = 60;

async function fetchStories(): Promise<StoriesPage> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL || ""}/backend/stories`,
    {
      next: { revalidate },
    },
  );
  if (!res.ok) throw new Error("failed_fetch");
  return res.json();
}

export default async function Home() {
  const data = await fetchStories();

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Hot</h1>
      <InfiniteStories initial={data} />
    </div>
  );
}
