# Memory Index

- [Typecheck validation](feedback_validation_typecheck.md) — `vite build` never type-checks; run `tsc -p tsconfig.app.json | grep TS2304` (root tsconfig.json is a no-op); assert every scripted replace
- [Communication style](feedback_communication_style.md) — user is a lawyer, NOT a coder; never use bare code identifiers as shared vocabulary, explain in plain English
- [Customer account actions](feedback_customer_account_actions.md) — never cancel/alter a customer's own subscription; give them the means and let them act
- [Verification feedback](feedback_verification.md) — Launching app, UI inspection and end-to-end testing of docx/pdf permitted (updated 2026-09-06)
- [Work on main](feedback_work_on_main.md) — from v2.0.4, commit/push/tag on `main`; `develop` is retired (it caused which-branch confusion)
- [Release process](project_release_process.md) — CI tag trigger, draft-by-version, asset auto-overwrite, mac DMG UDZO/shrink fix
- [Writ Petition (DHC) feature](project_writ_petition_dhc.md) — develop-branch WP mode: skeleton, IO rules, Facts-section LoD→prose transposition design
- [Original Application (CAT)](project_oa_cat.md) — 3rd doctype build (staged): Stage-1 foundation done (courtType/mode-select/settings/bench); design+PT+MAs+Signing-Pages locked; reuses WP internals
- [Settings Cancel snapshot](project_settings_cancel_snapshot.md) — Settings Cancel reverts via open-time snapshot; new settings MUST be Save-gated (no immediate localStorage writes) or Cancel re-breaks
- [Billing overhaul 2026](project_billing_overhaul_2026.md) — court-based plans, 1-yr grandfather w/ in-app consent, phases A–E; UPI mandate cap = exact plan price (any price rise needs re-auth)
- [Drafto subscription stack](reference_drafto_subscription_stack.md) — cross-repo billing/website/auth map: Vercel quindoph-website + Firebase draftoslp + Razorpay + GitHub + Hostinger; webhook Fn lives OUTSIDE any repo
- [Entitlement enforcement](project_entitlement_enforcement.md) — Phase-0 entitlement layer BUILT (uncommitted): reads users/{uid}, gates edit+export, read-only on lapse; pre-ship needs accessOverride on owner/legacy docs + manage-URL confirm
- [SLP multi-document Appendix](project_slp_appendix_multi.md) — Appendix takes many docs (provisions/judgment/custom), one Index row + component each; stamps anchor on the CropBox; numbered paragraphs restart after a table
- [Settings multi-doctype](project_settings_multidoctype.md) — Settings generalised to court/doctypes: Option-1 flat keys, one-time SLP→other seed, per-doctype nav w/ court tags (SC/HC/CAT); volume+checklist SC-only, SLP filed-by kept as-is
- [Project naming](project_project_naming.md) — the file name IS the project name (editable in the header, renames on disk); nothing ever overwrites another matter
