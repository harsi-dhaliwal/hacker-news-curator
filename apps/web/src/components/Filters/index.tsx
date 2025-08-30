"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function Filters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const sp = new URLSearchParams(params?.toString());
    sp.set(key, value);
    router.push(`${pathname}?${sp.toString()}`);
  }

  const sort = params?.get("sort") || "hot";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="text-gray-500">Sort:</label>
      {[
        { key: "hot", label: "Hot" },
        { key: "newest", label: "Newest" },
        { key: "points", label: "Points" },
        { key: "comments", label: "Comments" },
      ].map((o) => (
        <button
          key={o.key}
          onClick={() => setParam("sort", o.key)}
          className={
            "rounded-md border px-2 py-1 " +
            (sort === o.key
              ? "border-orange-600 bg-orange-50 text-orange-700"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

