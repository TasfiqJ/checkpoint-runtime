export function LoadingSpinner({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
      {text}
    </div>
  );
}
