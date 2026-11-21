import { parsePolicy, type VerificationPolicy } from "./rules";

/**
 * The verification policy is configuration the BUSINESS owns (see docs/config/VERIFICATION_POLICY.md): the environment variable VERIFICATION_POLICY holds one JSON object
 * (the same convention as QUOTATION_TAX_RULES). It is read on every call, never cached in a module, so a change is picked up and a test can set it.
 * There is no built-in default: a missing or invalid policy means nobody can submit and nobody can approve, with a message that names what is missing.
 */
export type PolicyStatus = { state: "CONFIGURED"; policy: VerificationPolicy } | { state: "MISSING"; message: string } | { state: "INVALID"; message: string; problems: string[] };

export const POLICY_MISSING_MESSAGE = "The company verification policy is not configured. The business must decide the required evidence, review criteria, decision reasons and which identity fields are material, then set VERIFICATION_POLICY (docs/config/VERIFICATION_POLICY.md).";

export function getPolicy(): PolicyStatus {
  const raw = process.env.VERIFICATION_POLICY?.trim();
  if (!raw) return { state: "MISSING", message: POLICY_MISSING_MESSAGE };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: "INVALID", message: "VERIFICATION_POLICY is not valid JSON.", problems: ["VERIFICATION_POLICY is not valid JSON."] };
  }
  const r = parsePolicy(parsed);
  return r.ok ? { state: "CONFIGURED", policy: r.policy } : { state: "INVALID", message: `VERIFICATION_POLICY is invalid: ${r.problems[0]}`, problems: r.problems };
}
