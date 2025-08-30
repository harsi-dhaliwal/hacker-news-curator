"use client";
import type { StoryBase } from "@/types/api";

export default function StoryCard({ story }: { story: StoryBase }) {
  const href = story.url || `https://news.ycombinator.com/item?id=${story.hn_id ?? ""}`;
  const domain = story.domain || (story.url ? new URL(story.url).hostname.replace(/^www\./, "") : "");
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <h3 className="text-base font-semibold leading-snug text-gray-900">
        <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {story.title}
        </a>
      </h3>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        {domain && <span className="rounded bg-gray-100 px-1.5 py-0.5">{domain}</span>}
        {typeof story.points === "number" && <span>▲ {story.points}</span>}
        {typeof story.comments_count === "number" && <span>💬 {story.comments_count}</span>}
        <span>{new Date(story.created_at).toLocaleString()}</span>
      </div>
      {(story.tags?.length || 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {story.tags!.map((t) => (
            <span key={t.id} className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-700">
              #{t.slug}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

