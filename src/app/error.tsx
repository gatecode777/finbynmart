"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { ErrorFallback } from "@/components/error/ErrorFallback";

/**
 * Root route boundary (Page 75): catches an unexpected failure in any page below the root layout that has no nearer error.tsx (several listing routes have their own).
 * The healthy layout (header, navigation, footer) stays, so this renders only the message. "Try Again" refreshes the server data AND resets the boundary, because reset()
 * alone re-renders on the client and cannot recover from a failed server render. It runs once per click: nothing retries by itself, and no form or business action is replayed.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return <ErrorFallback reference={error.digest} onRetry={() => startTransition(() => { router.refresh(); reset(); })} />;
}
