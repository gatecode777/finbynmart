import Link from "next/link";

/** Shown under a form when the server says the visitor must sign in first. */
export function SignInPrompt({ className }: { className?: string }) {
  return (
    <p className={className}>
      <Link href="/sign-in">Sign in</Link> or <Link href="/sign-up">create a free account</Link> to continue.
    </p>
  );
}
