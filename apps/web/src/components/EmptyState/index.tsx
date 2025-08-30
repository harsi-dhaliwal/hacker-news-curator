export default function EmptyState({ message = "No results" }: { message?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
      {message}
    </div>
  );
}

