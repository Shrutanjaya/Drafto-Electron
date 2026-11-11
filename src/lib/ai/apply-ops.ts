// ── Drafto AI knowledge: applying approved operations to the form ────────────
// Runs ONLY after the user has reviewed and approved the suggestions. List rows
// are passed through their Zod item schema so each row gets a fresh id, the
// correct defaults (e.g. empty annexures array), and proper type coercion
// (e.g. impugnedOrders.date ISO string → Date).

import type { UseFormReturn, FieldValues } from "react-hook-form";
import {
  vaadiTableItemSchema,
  lodTableItemSchema,
  aamTableItemSchema,
  impugnedOrderSchema,
  commonOrderPartyGroupSchema,
  iaGroundItemSchema,
  customIaSchema,
  iaSchema,
  legalProvisionSchema,
  appendixItemSchema,
  oaMaSchema,
} from "@/lib/schema";
import type { SafeOp } from "./form-patch";
import { cleanOpValues, stripHtml } from "./clean-html";

function normalizeAamRow(r: Record<string, unknown>): Record<string, unknown> {
  const row = { ...r };
  if (row.isHeading || row.heading) {
    row.heading = stripHtml(row.heading);
    row.particulars = "";
  }
  return row;
}

function normalizeVaadiRow(r: Record<string, unknown>): Record<string, unknown> {
  const row = { ...r };
  if (typeof row.name === "string") row.name = stripHtml(row.name);
  if (typeof row.address === "string") row.address = stripHtml(row.address);
  if (typeof row.positionInEarlierCourt === "string") row.positionInEarlierCourt = stripHtml(row.positionInEarlierCourt);
  if (typeof row.through === "string") row.through = stripHtml(row.through);
  if (typeof row.relationship === "string") row.relationship = stripHtml(row.relationship);
  if (typeof row.fatherName === "string") row.fatherName = stripHtml(row.fatherName);
  if (typeof row.age === "string") row.age = stripHtml(row.age);
  if (typeof row.phone === "string") row.phone = stripHtml(row.phone);
  if (typeof row.email === "string") row.email = stripHtml(row.email);
  if (typeof row.cin === "string") row.cin = stripHtml(row.cin);
  if (typeof row.occupation === "string") row.occupation = stripHtml(row.occupation);
  return row;
}

function normalizeImpugnedOrderRow(r: Record<string, unknown>): Record<string, unknown> {
  const row = { ...r };
  if (typeof row.caseNumber === "string") row.caseNumber = stripHtml(row.caseNumber);
  if (typeof row.court === "string") row.court = stripHtml(row.court);
  if (typeof row.customCourt === "string") row.customCourt = stripHtml(row.customCourt);
  if (typeof row.effect === "string") row.effect = stripHtml(row.effect);
  return row;
}

function normalizeCommonOrderPartyGroup(r: Record<string, unknown>): Record<string, unknown> {
  const group = { ...r };
  if (typeof group.caseNumber === "string") group.caseNumber = stripHtml(group.caseNumber);
  if (Array.isArray(group.petitioners)) {
    group.petitioners = group.petitioners.map((p) => (p && typeof p === "object" ? normalizeVaadiRow(p as Record<string, unknown>) : p));
  }
  if (Array.isArray(group.respondents)) {
    group.respondents = group.respondents.map((p) => (p && typeof p === "object" ? normalizeVaadiRow(p as Record<string, unknown>) : p));
  }
  return group;
}

function normalizeLodRow(r: Record<string, unknown>): Record<string, unknown> {
  const row = { ...r };
  if (row.isHeading || row.heading) {
    row.heading = stripHtml(row.heading);
    row.event = "";
    row.date = "";
  } else if (!row.event && typeof row.particulars === "string") {
    row.event = row.particulars;
  }
  if (typeof row.date === "string") {
    row.date = stripHtml(row.date);
  }
  if (Array.isArray(row.annexures)) {
    row.annexures = row.annexures.map((a: any) => {
      if (!a || typeof a !== "object") return a;
      const annex = { ...a };
      if (typeof annex.title === "string") {
        annex.title = stripHtml(annex.title);
      }
      if (typeof annex.date === "string") {
        annex.date = stripHtml(annex.date);
      }
      const rawCopy =
        typeof annex.copyType === "string"
          ? stripHtml(annex.copyType).toLowerCase()
          : "";
      if (rawCopy.includes("translated") && rawCopy.includes("true")) {
        annex.copyType = "true and translated copy";
      } else if (rawCopy.includes("typed") && rawCopy.includes("true")) {
        annex.copyType = "true and typed copy";
      } else if (rawCopy.includes("translated")) {
        annex.copyType = "translated copy";
      } else if (rawCopy.includes("typed")) {
        annex.copyType = "typed copy";
      } else {
        annex.copyType = "true copy";
      }
      if (typeof annex.isAdditionalDocument !== "boolean") {
        annex.isAdditionalDocument = Boolean(annex.isAdditionalDocument);
      }
      return annex;
    });
  }
  return row;
}

const LIST_ITEM_PARSERS: Record<string, (raw: Record<string, unknown>) => unknown> = {
  petitioners: (r) => vaadiTableItemSchema.parse(normalizeVaadiRow(r)),
  respondents: (r) => vaadiTableItemSchema.parse(normalizeVaadiRow(r)),
  listOfDates: (r) => lodTableItemSchema.parse(normalizeLodRow(r)),
  questionsOfLaw: (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  grounds: (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  interimReliefGrounds: (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  interimReliefPrayers: (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  impugnedOrders: (r) => impugnedOrderSchema.parse(normalizeImpugnedOrderRow(r)),
  // Nested-list rows: the parent schema parses their inner arrays recursively.
  commonOrderParties: (r) => commonOrderPartyGroupSchema.parse(normalizeCommonOrderPartyGroup(r)),
  customIas: (r) => customIaSchema.parse(r),
  ias: (r) => iaSchema.parse(r),
  // IA grounds / additional-document grounds (flat particulars rows).
  "standardIas.condonationOfDelay.grounds": (r) => iaGroundItemSchema.parse(r),
  "standardIas.condonationOfDelayInRefiling.grounds": (r) => iaGroundItemSchema.parse(r),
  "standardIas.exemptionFromSurrendering.grounds": (r) => iaGroundItemSchema.parse(r),
  "standardIas.suspensionOfSentence.grounds": (r) => iaGroundItemSchema.parse(r),
  "standardIas.additionalDocumentsGrounds": (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  "listingProforma.legalProvisions": (r) => legalProvisionSchema.parse(r),
  appendixItems: (r) => appendixItemSchema.parse(r),
  // Writ Petition (Delhi HC & SC WP) list fields.
  "wp.reliefs": (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  "wp.factsRows": (r) => lodTableItemSchema.parse(normalizeLodRow(r)),
  "wp.cms.stay.body": (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  "wp.cms.stay.prayers": (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  "wp.cms.lengthySynopsis.body": (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  "wp.cms.lengthySynopsis.prayers": (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  "wp.cms.exemptionCopies.body": (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  "wp.cms.exemptionCopies.prayers": (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  "wp.customCms": (r) => customIaSchema.parse(r),
  // Original Application (CAT) list fields.
  "oa.reliefs": (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  "oa.factsRows": (r) => lodTableItemSchema.parse(normalizeLodRow(r)),
  "oa.interimReliefs": (r) => aamTableItemSchema.parse(normalizeAamRow(r)),
  "oa.mas": (r) => oaMaSchema.parse(r),
};

// Apply a set of approved ops. Returns the list of paths actually written.
export function applyOps(form: UseFormReturn<FieldValues>, ops: SafeOp[]): string[] {
  const applied: string[] = [];
  for (const op of ops) {
    try {
      if (op.kind === "scalar") {
        const val = cleanOpValues(op.value, op.path);
        form.setValue(op.path, val, { shouldDirty: true, shouldTouch: true });
      } else {
        const parser = LIST_ITEM_PARSERS[op.path];
        const cleanedItems = op.items.map((it) => cleanOpValues(it));
        const items = parser
          ? cleanedItems.map((it, idx) => {
              try {
                return parser(it as Record<string, unknown>);
              } catch (err) {
                console.warn(`[applyOps] Parse fallback on ${op.path}[${idx}]:`, err, it);
                const fb = typeof it === "object" && it !== null ? { ...(it as any) } : {};
                if (!fb.id) fb.id = `item_${Date.now()}_${idx}`;
                return fb;
              }
            })
          : cleanedItems;
        form.setValue(op.path, items, { shouldDirty: true, shouldTouch: true });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("drafto-table-reload", { detail: { path: op.path } }));
        }
      }
      applied.push(op.path);
    } catch (err) {
      console.error(`[applyOps] Failed to apply op to ${op.path}:`, err);
      // Skip any op that fails to parse rather than aborting the whole batch.
    }
  }
  return applied;
}
