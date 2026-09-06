---
name: feedback_communication_style
description: "User is a lawyer, NOT a coder — never use bare code identifiers as if they are shared vocabulary; explain in plain English"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fff0dced-bc32-499c-a3b6-a48854f8e259
  modified: 2026-08-04T07:53:18.765Z
---

The user is a practising advocate and runs Drafto as a business. **He does not read or write code.** Claude Code wrote the entire codebase, so identifiers like `suiteAccessUntil`, `tierForPlan`, `resolveEntitlement`, `ENTITLEMENT_ENABLED` are meaningless to him — he has never seen them and will not recognise them.

Stated directly 2026-08-03: "I need you to remember that I am not a coder. So when you throw names like suiteAccessUntil and tierForPlan, I don't understand them. Claude Code has written them. So you'll have to remember that you have to talk to me like I'm a layman (a lawyer)."

**Why:** Naming internals without explanation makes the answer unusable to him — he cannot evaluate a plan or make a business decision if it is phrased in symbols he does not hold.

**Also, 2026-08-04: replies are too long.** Wants short, to-the-point answers — but explicitly "without omitting anything necessary". So: cut preamble, recap and restatement; keep every risk, caveat and action he has to take. Lead with the answer in the first line. This is now also in his user-level `~/.claude/CLAUDE.md`, so it applies in every project.

**How to apply:**
- Lead with the plain-English effect ("existing subscribers would get the new document types for free by accident"), never with the identifier.
- If a specific file or setting must be named so he can point Claude Code at it later, name it *after* the plain description and mark it as such — e.g. "there's a setting that decides which document types a plan unlocks (in the code it's `tierForPlan`)".
- Business framing over engineering framing: money, customers, friction, risk of losing subscribers.
- He is highly capable at reasoning about his own product and billing — this is about vocabulary, not about simplifying the substance. Do not dumb down the analysis or omit trade-offs.
- Applies to Drafto's billing/auth stack work as much as to app code. See [[project_entitlement_enforcement]], [[reference_drafto_subscription_stack]].
