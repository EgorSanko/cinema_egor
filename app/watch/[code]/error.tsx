// app/watch/[code]/error.tsx
"use client";

import { useEffect } from "react";

export default function WatchError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("Watch room error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <p className="text-red-400 text-xl font-semibold mb-2">Error</p>
        <pre className="text-gray-400 text-sm mb-6 whitespace-pre-wrap text-left bg-gray-900 p-4 rounded-xl overflow-auto max-h-60">
          {error.message}
          {"\n\n"}
          {error.stack}
        </pre>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="px-6 py-3 bg-purple-500 hover:bg-purple-600 rounded-xl text-white font-medium">
            Попробовать снова
          </button>
          <a href="/watch" className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-white font-medium">
            Назад
          </a>
        </div>
      </div>
    </div>
  );
}
