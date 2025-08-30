import { FeedSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl p-4">
      <FeedSkeleton />
    </div>
  );
}

