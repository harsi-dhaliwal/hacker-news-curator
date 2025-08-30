"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function SearchBox() {
  const [q, setQ] = useState("");
  const router = useRouter();
  const params = useSearchParams();
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams(params?.toString());
    sp.set("q", q);
    router.push(`/search?${sp.toString()}`);
  };
  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search stories..."
        className="w-full max-w-md rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300"
      />
      <button
        type="submit"
        className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
      >
        Search
      </button>
    </form>
  );
}

