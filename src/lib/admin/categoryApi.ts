import type { AdminCapability } from "./permissions";
import type { Caps } from "./categoryManagement";

/** Every flag comes from the account record (the guard's permissions), never from the request. */
export const categoryCapsOf = (p: readonly AdminCapability[]): Caps => ({ activation: p.includes("categories.activation"), audit: p.includes("categories.audit") });
