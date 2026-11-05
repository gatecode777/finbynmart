# Page 31 — Returns and refunds

Status: **BLOCKED.** There is no return policy, return workflow, approval flow, refund record or payment module. No return endpoint is created (`/return-requests`), no Request Return action is shown, and the page never describes a refund as requested, approved or completed. RETURN_REQUESTED and RETURNED exist as lifecycle statuses (so a future workflow has somewhere to write) and are counted by the rules, but nothing in the application sets them.

PRD rules to keep when it is built: only offer a return where the real policy and workflow exist; capture order, item, quantity, reason, description, optional supporting file and date; never show automatic approval; a refund status must come from an actual refund record; a refund request is never described as a completed refund.
