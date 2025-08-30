export function StoryCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4">
      <div className="h-4 w-3/4 rounded bg-gray-200" />
      <div className="mt-2 flex gap-2">
        <div className="h-3 w-16 rounded bg-gray-200" />
        <div className="h-3 w-12 rounded bg-gray-200" />
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <StoryCardSkeleton key={i} />
      ))}
    </div>
  );
}

