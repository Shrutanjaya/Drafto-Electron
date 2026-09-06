---
name: feedback_customer_account_actions
description: "Never cancel or alter a CUSTOMER's subscription/account on their behalf — let the customer do it; identity inferences can be wrong"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b33fd6a3-028d-4e07-9329-30229468138c
  modified: 2026-08-04T07:21:08.601Z
---

Do not cancel, modify, or otherwise act on a **customer's** subscription or account unless the user names that customer and that action explicitly. Broad approvals about a customer's billing outcome ("he pays 499", "switch him before the 11th") authorise the *outcome*, not me operating on their live subscription.

Stated 2026-08-04 after I moved to cancel a customer's day-old ₹999 subscription: *"I never asked you to cancel today's 999 subscription. What if he turns around and says it's not him? Let him cancel himself after a week, I'm sure he won't want to pay twice."*

**Why:** two distinct reasons, both good.
1. **Identity is usually inferred, not proven.** That account was linked to the customer only by a first name and a phone number differing by one digit. Wrong inference = cancelling a stranger's subscription.
2. **A customer cancelling themselves is self-enforcing and self-documenting.** Nobody pays twice willingly, so the incentive does the work — and there is no dispute later about who cancelled.

**How to apply:** for anything touching a customer's own subscription, produce the *means* (a payment link, a draft email, the working self-serve button) and let the customer act. Server-side/config work on Drafto's own systems is different and is covered by the usual per-action deploy approvals. See [[project_billing_overhaul_2026]].

Related trap from the same day: a "safe" test script can stop being safe when the code it exercises changes. My renewal repro was harmless only while renewal always failed; once fixed, re-running it created a real subscription and cancelled a live one. **Re-read a test's side effects before re-running it against production after changing that exact behaviour.**
