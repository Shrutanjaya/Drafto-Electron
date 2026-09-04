// ── How an annexure reads in the generation dialogs ──────────────────────────
// The paper-book Index describes an annexure in full — what kind of copy it is,
// what it is, its date, and whatever the user added in their own words. The
// dialogs showed only the description, so the row a lawyer checks before filing
// said less than the Index it is checking against. One function, so all three
// tools describe an annexure the same way.

export interface AnnexureLike {
  copyType?: string;
  title?: string;
  date?: string;
  customText?: string;
  isColly?: boolean;
}

// "True copy of the order of the District Magistrate dated 01.01.2026, issued
// under s.12". Anything not filled in is left out rather than printed as a gap.
export function annexureDetails(annex: AnnexureLike): string {
  const title = (annex.title || "").trim();
  const date = (annex.date || "").trim();
  const extra = (annex.customText || "").trim();

  const copy = annex.isColly
    ? "True copies"
    : (() => {
        const c = (annex.copyType || "true copy").trim();
        return c.charAt(0).toUpperCase() + c.slice(1);
      })();

  let out = title ? `${copy} of ${title}` : copy;
  if (date) out += ` dated ${date}`;
  if (extra) out += `, ${extra.replace(/\.$/, "")}`;
  return out;
}
