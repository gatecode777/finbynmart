"use client";

import { ErrorFallback } from "@/components/error/ErrorFallback";

/**
 * Global boundary (Page 75): replaces the root layout when the root layout itself (or the shell it renders) fails, so it supplies its own <html> and <body> and uses no
 * application CSS, fonts, providers, header or footer. "Try Again" calls the boundary's reset() and then reloads the current page: reset() only re-renders on the client, so on its own it cannot recover
 * from a failed server-rendered root layout. The reload is a plain GET started by that one click (never automatic, never a form replay). The homepage and support links are plain anchors (full page load).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <ErrorFallback standalone reference={error.digest} onRetry={() => { reset(); window.location.reload(); }} />
      </body>
    </html>
  );
}
