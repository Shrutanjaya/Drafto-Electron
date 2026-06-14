// ── IA standard-paragraph preview text (UI-ONLY) ─────────────────────────────
// Read-only mirror of the boilerplate that generateIaDocx() in actions.ts wraps
// around the user's grounds/prayers. Shown in the Applications tab so the user
// can see exactly where their input lands in the final document.
//
// IMPORTANT: this is a hand-maintained copy for display only. If the wording in
// actions.ts (generateIaDocx) changes, update it here too. Dynamic bits (delay
// days, annexure numbers, the impugned-order text) are shown as readable
// placeholders rather than the exact runtime values.

import { format } from "date-fns";

const IO = "the Impugned Order(s)";

// Mirror of calculateIoText() in actions.ts: builds the full, extracted impugned
// order description (e.g. "the Impugned Final Order dated 01.01.2024 passed by
// the High Court of … in W.P. 123/2024") so the preview matches the docx exactly.
// Falls back to the generic "the Impugned Order(s)" placeholder when no orders
// have been entered yet.
export function buildImpugnedOrderText(
  orders?: Array<{ type?: string; date?: string | Date; court?: string; customCourt?: string; caseNumber?: string }>,
): string {
  if (!orders || orders.length === 0) return IO;
  const sorted = [...orders].sort(
    (a, b) => new Date(a.date as any).getTime() - new Date(b.date as any).getTime(),
  );
  return sorted
    .map((order) => {
      const courtName = order.court === "Other" ? order.customCourt : order.court;
      const orderDate = order.date ? format(new Date(order.date as any), "dd.MM.yyyy") : "[date]";
      return `the Impugned ${order.type} dated ${orderDate} passed by the ${courtName || "[Court]"} in ${order.caseNumber || "[Case No.]"}`;
    })
    .join(" and ");
}

// Common opening paragraph, inserted for every IA before its specific content.
// `io` is the extracted impugned-order text (see buildImpugnedOrderText); when
// omitted it falls back to the generic placeholder.
export function getIaCommonOpening(io: string = IO): string {
  return `The accompanying Special Leave Petition has been filed against ${io}. The contents of the Special Leave Petition may kindly be treated as part and parcel of this application and are not being repeated herein for the sake of brevity.`;
}

// Custom-IA Para 2 lead sentence; the user's free text is appended after it.
export const CUSTOM_IA_PARA2_LEAD = "The present application is being filed by the Petitioner(s)";

export function getCustomIaPara2(para2?: string): string {
  const extra = (para2 || "").trim();
  return extra ? `${CUSTOM_IA_PARA2_LEAD} ${extra}` : CUSTOM_IA_PARA2_LEAD;
}

// Common closing paragraphs, inserted after the IA's specific content.
export const IA_COMMON_CLOSING: string[] = [
  "No prejudice would be caused to the Respondent(s) if this application were allowed. On the other hand, irreparable injury would be caused to the Petitioner(s) if the application were not allowed.",
  "This application is filed in good faith and in the interests of justice.",
];

export const IA_PRAYER_LEAD =
  "In view of the foregoing averments, it is most respectfully prayed that this Hon'ble Court may be pleased to:";

// Auto-appended as the last prayer for every standard IA.
export const IA_PRAYER_TAIL =
  "Pass any such other or further order(s) as this Hon'ble Court may deem fit in the facts and circumstances of this case.";

export interface IaPreviewOpts {
  delayDays?: number | string;
  annexureList?: string; // OT — e.g. "Annexure P-3"
  otUserReason?: string; // OT — optional user-entered reason
  adRange?: string;      // AD — e.g. "Annexures P-5 to P-7"
  ccApplied?: "yes" | "no";
  ccReceiptDate?: string;
  ccReason?: string;
  io?: string;           // extracted impugned-order text (see buildImpugnedOrderText)
}

// The IA-specific lead-in paragraph that introduces the user's grounds/content.
export function getIaLeadIn(id: string, o: IaPreviewOpts = {}): string {
  const delay = o.delayDays ?? "__";
  const io = o.io || IO;
  switch (id) {
    case "condonationOfDelay":
      return `This application, seeking condonation of delay of ${delay} days in filing the accompanying SLP, is preferred on the following grounds:`;
    case "exemptionCertifiedCopy": {
      let t = `This application seeks exemption from filing certified copy of ${io}. `;
      if (o.ccApplied === "yes") {
        t += `It is most respectfully submitted that the Petitioner(s) have applied for a certified copy of ${io}. Annexure-A is a true copy of the Receipt dated ${o.ccReceiptDate || "[date]"} reflecting the application for certified copy made by/on behalf of the Petitioner(s). `;
      } else {
        t += `It is most respectfully submitted that the Petitioner(s) have not been able to apply for a certified copy of ${io}. ${o.ccReason ? o.ccReason + " " : ""}`;
      }
      t += "In the circumstances, it is prayed that an exemption from filing the certified copy may be granted. The Petitioner(s) undertake(s) to produce the certified copy as and when made available to the Petitioner(s) and/or directed by this Hon'ble Court.";
      return t;
    }
    case "additionalDocuments":
      return "This application seeks permission to place on record the following additional facts and documents, which are necessary and proper for the adjudication of the accompanying SLP:";
    case "exemptionOfficialTranslation": {
      const r = (o.otUserReason || "").trim();
      return `This application seeks exemption from filing Official Translation(s) of ${o.annexureList || "the annexures"}. ${r ? r + " " : ""}It is prayed that in view of the urgency and the facts and circumstances of this case, exemption from filing Official Translation(s) may be granted.`;
    }
    case "exemptionFromSurrendering":
      return `This application, seeking exemption from surrendering pursuant to ${io}, is preferred on the following grounds:`;
    case "custom":
      return "The present application is filed on the following grounds:";
    default:
      return "";
  }
}

// The IA-specific prayer (shown before the common "any other order" tail).
export function getIaPrayer(id: string, o: IaPreviewOpts = {}): string {
  const delay = o.delayDays ?? "__";
  const io = o.io || IO;
  switch (id) {
    case "condonationOfDelay":
      return `Condone the delay of ${delay} days in filing the accompanying SLP against ${io}; and`;
    case "exemptionCertifiedCopy":
      return `Grant exemption to the Petitioner(s) from filing certified copy of ${io}; and`;
    case "additionalDocuments":
      return `Permit the Petitioner(s) to place on record the additional document(s) marked as ${o.adRange || "[additional annexures]"}; and`;
    case "exemptionOfficialTranslation":
      return `Grant exemption to the Petitioner(s) from filing Official Translation(s) of ${o.annexureList || "the annexures"}; and`;
    case "exemptionFromSurrendering":
      return `Grant exemption to the Petitioner(s) from surrendering pursuant to ${io}; and`;
    default:
      return "";
  }
}
