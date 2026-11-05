/**
 * Runs once when the server starts, before it takes requests: warms the catalogue (see instrumentation-node.ts).
 * Only the Node runtime does anything. The positive `=== "nodejs"` block is the form Next documents: the edge compile
 * removes it, so `node:fs` is never bundled for the edge (an early `return` is not removed in development and fails with
 * "UnhandledSchemeError: Reading from node:fs").
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warmCatalogue } = await import("./instrumentation-node");
    await warmCatalogue();
  }
}
