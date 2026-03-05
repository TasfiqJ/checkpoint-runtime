export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-4 py-3">
      {message}
    </div>
  );
}
