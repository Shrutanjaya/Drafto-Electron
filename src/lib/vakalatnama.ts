// ── Vakalatnama wording (Delhi HC and CAT) ───────────────────────────────────
// One source for the text both tools print, so the two cannot drift apart. Only
// the two words that genuinely differ are passed in: what the party is called
// (Petitioner / Applicant) and what the forum is called (Court / Tribunal).

export interface VakAdvocate {
  name?: string;
  firm?: string;
  address?: string;
  phone?: string;
  email?: string;
}

// "…appoint A. N. Advocate of Chambers & Co., having the address …, phone
// number … and email address …". Details the user has not filled in are simply
// left out, so the sentence never reads with a gap in it.
export function vakalatnamaAppointment(adv: VakAdvocate): string {
  const name = (adv.name || "").trim() || "[Advocate]";
  const firm = (adv.firm || "").trim();

  const having: string[] = [];
  if ((adv.address || "").trim()) having.push(`the address ${adv.address!.trim()}`);
  if ((adv.phone || "").trim()) having.push(`phone number ${adv.phone!.trim()}`);
  if ((adv.email || "").trim()) having.push(`email address ${adv.email!.trim()}`);
  const list = having.length <= 1
    ? having[0] || ""
    : `${having.slice(0, -1).join(", ")} and ${having[having.length - 1]}`;

  // "A. N. Advocate of Chambers & Co., having the address …, phone number …
  // and email address …" — the comma belongs before "having", whether or not a
  // firm was named.
  return `${name}${firm ? ` of ${firm}` : ""}${list ? `, having ${list}` : ""}`;
}

// The whole opening paragraph.
export function vakalatnamaOpening(opts: {
  executants: string;      // "A. B." or "A. B.; C. D."
  partyLabel: string;      // "Petitioner" / "Applicant No. 2" / "Petitioners"
  advocate: VakAdvocate;
  multi: boolean;
}): string {
  const { executants, partyLabel, advocate, multi } = opts;
  const I = multi ? "We" : "I";
  const my = multi ? "our" : "my";
  const him = multi ? "them" : "him";
  return `${I}, ${executants}, the ${partyLabel} in the captioned matter, do hereby appoint ${vakalatnamaAppointment(advocate)}, to be ${my} Advocate in the above-noted case and authorise ${him}:`;
}

// The lettered authorities. `forum` is the court or tribunal being addressed.
export function vakalatnamaAuthorities(forum: "Court" | "Tribunal"): string[] {
  return [
    `To act, appear and plead in the above-noted case before this Hon’ble ${forum} or in any other Court or Tribunal in which the same may be tried or heard and also in appeal or revision.`,
    "To sign, file, verify and present pleadings, applications, replies, objections, affidavits or other documents as may be deemed necessary or proper for the prosecution of the said case in all its stages.",
    "To withdraw or compromise the said case or submit to arbitration any differences or disputes arising in the said case.",
    "To deposit, draw and receive moneys and grant receipts therefor and to do all other acts and things necessary for the prosecution of the said case.",
    "To appoint and instruct any other legal Practitioner to exercise the powers and authority hereby conferred whenever the Advocate may think fit.",
  ];
}

export const VAKALATNAMA_FEES_LINE = "Agreed subject to the terms of fees.";

// "PETITIONER" on its own, or "PETITIONER NO. 2" where there are several.
export function vakalatnamaPartyLabel(noun: "Petitioner" | "Applicant", index?: number, total = 1): string {
  return total > 1 && index !== undefined ? `${noun} No. ${index + 1}` : noun;
}
