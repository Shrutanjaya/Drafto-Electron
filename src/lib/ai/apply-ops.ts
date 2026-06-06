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
} from "@/lib/schema";
import type { SafeOp } from "./form-patch";

const LIST_ITEM_PARSERS: Record<string, (raw: Record<string, unknown>) => unknown> = {
  petitioners: (r) => vaadiTableItemSchema.parse(r),
  respondents: (r) => vaadiTableItemSchema.parse(r),
  listOfDates: (r) => lodTableItemSchema.parse(r),
  questionsOfLaw: (r) => aamTableItemSchema.parse(r),
  grounds: (r) => aamTableItemSchema.parse(r),
  interimReliefGrounds: (r) => aamTableItemSchema.parse(r),
  interimReliefPrayers: (r) => aamTableItemSchema.parse(r),
  impugnedOrders: (r) => impugnedOrderSchema.parse(r),
  // Nested-list rows: the parent schema parses their inner arrays recursively.
  commonOrderParties: (r) => commonOrderPartyGroupSchema.parse(r),
  customIas: (r) => customIaSchema.parse(r),
  ias: (r) => iaSchema.parse(r),
  // IA grounds / additional-document grounds (flat particulars rows).
  "standardIas.condonationOfDelay.grounds": (r) => iaGroundItemSchema.parse(r),
  "standardIas.exemptionFromSurrendering.grounds": (r) => iaGroundItemSchema.parse(r),
  "standardIas.additionalDocumentsGrounds": (r) => aamTableItemSchema.parse(r),
  "listingProforma.legalProvisions": (r) => legalProvisionSchema.parse(r),
};

// Apply a set of approved ops. Returns the list of paths actually written.
export function applyOps(form: UseFormReturn<FieldValues>, ops: SafeOp[]): string[] {
  const applied: string[] = [];
  for (const op of ops) {
    try {
      if (op.kind === "scalar") {
        form.setValue(op.path, op.value, { shouldDirty: true, shouldTouch: true });
      } else {
        const parser = LIST_ITEM_PARSERS[op.path];
        const items = parser ? op.items.map((it) => parser(it)) : op.items;
        form.setValue(op.path, items, { shouldDirty: true, shouldTouch: true });
      }
      applied.push(op.path);
    } catch {
      // Skip any op that fails to parse rather than aborting the whole batch.
    }
  }
  return applied;
}
