"use client";
import type { StoryBase } from "@/types/api";
import { colorForKey } from "@/utils/color";

export default function StoryCard({ story, summarySnippet, summaryFull, variant = "small" }: { story: StoryBase; summarySnippet?: string; summaryFull?: string; variant?: "small" | "large" }) {
  const href = story.url || `https://news.ycombinator.com/item?id=${story.hn_id ?? ""}`;
  const domain = story.domain || (story.url ? new URL(story.url).hostname.replace(/^www\./, "") : "");
  const accent = colorForKey(story.tags?.[0]?.slug || story.class_type || domain || story.source);
  const summaryText = summaryFull || summarySnippet;
  return (
    <article className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md ring-1 ${accent.ring}`}>
      <div className={`-mx-4 -mt-4 mb-3 h-1 ${accent.bg}`} />
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
      {summaryText && (
        <p className={`mt-2 text-[0.95rem] leading-relaxed text-gray-800 ${variant === "large" ? "line-clamp-8" : "line-clamp-5"}`}>{summaryText}</p>
      )}
      {Array.isArray(story.summary_quicktake) && story.summary_quicktake.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          {story.summary_quicktake.slice(0, variant === "large" ? 3 : 2).map((q, i) => (
            <li key={i} className="line-clamp-2">{q}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
        {typeof story.reading_time_min === "number" && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5">⏱ {story.reading_time_min} min</span>
        )}
        {typeof story.confidence === "number" && (
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">✅ {(story.confidence * 100).toFixed(0)}%</span>
        )}
        {typeof story.impact_score === "number" && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">⚡ {story.impact_score}</span>
        )}
        {story.paywall === true && (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">Paywall</span>
        )}
        {(story.link_format === "pdf" || story.is_pdf) && (
          <span className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-700">PDF</span>
        )}
        {story.class_type && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5">{story.class_type}</span>
        )}
      </div>
      {(story.tags?.length || 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {story.tags!.map((t) => {
            const c = colorForKey(t.slug);
            return (
              <span key={t.id} className={`rounded-full px-2 py-0.5 text-xs ${c.bg} ${c.text}`}>
                #{t.slug}
              </span>
            );
          })}
        </div>
      )}
    </article>
  );
}
