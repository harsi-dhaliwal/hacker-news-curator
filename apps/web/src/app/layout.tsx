import type { Metadata } from "next";
import "@/styles/globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "HN Curator",
  description: "Curated tech news feed from HN",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-4">
            <nav className="flex items-center gap-4">
              <Link
                href="/"
                className="text-base font-semibold text-orange-600 hover:text-orange-700"
              >
                HN Curator
              </Link>
              <Link
                href="/search"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Search
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl p-4">{children}</main>
      </body>
    </html>
  );
}
