
import { z } from "zod";

// A constituent document inside a "(Colly)" annexure (Delhi HC writ petitions
// only — colly is not permitted in the Supreme Court). Each constituent gets its
// own nested bookmark in the output PDF, but the colly appears as a single entry
// in the Index and in the Facts section.
export const collyDocumentSchema = z.object({
  id: z.string().default(() => `colly_${Math.random()}`),
  title: z.string().default(""),
  date: z.string().default(""),
  file: z.any().optional(),
  filePath: z.string().optional(), // Absolute path to the PDF file on disk (Electron only)
});

export const annexureSchema = z.object({
  id: z.string().default(() => `annex_${Math.random()}`),
  file: z.any().optional(),
  filePath: z.string().optional(), // Absolute path to the PDF file on disk (Electron only)
  typedOrTranslatedFile: z.any().optional(),
  typedOrTranslatedFilePath: z.string().optional(), // Path for typed/translated file (Electron only)
  isAdditionalDocument: z.boolean().default(false),
  copyType: z.enum([
      "true copy",
      "typed copy",
      "true and typed copy",
      "translated copy",
      "true and translated copy"
    ]).default("true copy"),
  title: z.string().default(""),
  date: z.string().default(""),
  customText: z.string().default(""),
  // ── Delhi HC writ-petition-only fields (ignored by the SLP generator) ──
  // Colly annexure: clubs several documents under one P-number, each bookmarked
  // separately. `isColly` toggles it; `collyDocuments` holds the constituents.
  isColly: z.boolean().default(false),
  collyDocuments: z.array(collyDocumentSchema).default([]),
  // Marks this annexure as an Impugned Order (IO writs): it sorts ahead of the
  // other P-annexures (to P-1…) and is referenced by the auto-generated
  // "quash and set aside" relief.
  isImpugnedOrder: z.boolean().default(false),
});

export const iaAnnexureSchema = z.object({
  id: z.string().default(() => `ia_annex_${Math.random()}`),
  file: z.any().optional(),
  filePath: z.string().optional(), // Absolute path to the PDF file on disk (Electron only)
  title: z.string().default(""),
  date: z.string().default(""),
});

export const iaSchema = z.object({
  id: z.string().default(`ia_${Math.random()}`),
  name: z.string().default(""),
  prayer: z.string().default(""),
});

export const aamTableItemSchema = z.object({
  id: z.string().default(() => `item_${Math.random()}`),
  particulars: z.string().default(""),
});

export const iaGroundItemSchema = z.object({
  id: z.string().default(() => `ia_ground_${Math.random()}`),
  particulars: z.string().default(""),
  annexures: z.array(iaAnnexureSchema).default([]),
});

export const vaadiTableItemSchema = z.object({
  id: z.string().default(() => `vaadi_${Math.random()}`),
  name: z.string().default(""),
  address: z.string().default(""),
  positionInEarlierCourt: z.string().default(""),
});

export const lodTableItemSchema = z.object({
  id: z.string().default(() => `item_${Math.random()}`),
  date: z.string().default(""),
  event: z.string().default(""), // 'event' is the 'Particulars' field
  annexures: z.array(annexureSchema).default([]),
});

export const impugnedOrderSchema = z.object({
  id: z.string().default(() => `io_${Math.random()}`),
  type: z.enum(["Final Judgment and Order", "Final Order", "Interim Order"]).default("Final Judgment and Order"),
  date: z.preprocess((arg) => {
    if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
  }, z.date()).default(() => new Date()),
  caseNumber: z.string().default(""),
  court: z.string().default(""),
  customCourt: z.string().default(""),
  effect: z.string().default(""),
});

export const commonOrderPartyGroupSchema = z.object({
  id: z.string().default(() => `copg_${Math.random()}`),
  caseNumber: z.string().default(""),
  petitioners: z.array(vaadiTableItemSchema).default([vaadiTableItemSchema.parse({})]),
  respondents: z.array(vaadiTableItemSchema).default([vaadiTableItemSchema.parse({})]),
});
export type CommonOrderPartyGroup = z.infer<typeof commonOrderPartyGroupSchema>;

export const legalProvisionSchema = z.object({
  id: z.string().default(() => `lp_${Math.random()}`),
  type: z.enum(['Central Act', 'Central Rule', 'State Act', 'State Rule']).default('Central Act'),
  act: z.string().default(''),
  section: z.string().default(''),
});

export const customIaSchema = z.object({
    id: z.string().default(() => `custom_ia_${Math.random()}`),
    title: z.string().default("Application for"),
    // Para 2 free text, appended after "The present application is being filed
    // by the Petitioner(s)" in both the preview and the generated docx.
    para2: z.string().default(""),
    grounds: z.array(iaGroundItemSchema).default([iaGroundItemSchema.parse({})]),
    prayers: z.array(aamTableItemSchema).default([
        aamTableItemSchema.parse({}),
        aamTableItemSchema.parse({ particulars: "Pass any such other/further order(s) as this Hon'ble Court may deem fit in the facts and circumstances of this case." })
    ]),
});

// PDF Generation Dialog state
export const pdfMergeItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  useSystem: z.boolean(),
  userFile: z.any().nullable().optional(), // File object (can be null or undefined)
  userFilePath: z.string().nullable().optional(), // Path to file for save/load (Electron only, can be null)
});

const yesNoSchema = z.enum(["Yes", "No"]).default("Yes");
const yesNoNaSchema = z.enum(["Yes", "No", "NA"]).default("NA");

export const draftoProjectSchema = z.object({
  // Basic Tab
  petitioners: z.array(vaadiTableItemSchema).default([vaadiTableItemSchema.parse({})]),
  respondents: z.array(vaadiTableItemSchema).default([vaadiTableItemSchema.parse({})]),
  caseType: z.enum(["Civil", "Criminal"]).default("Civil"),
  // Top-level document-type discriminator. Existing saved projects predate this
  // field, so it defaults to "SLP" — they parse and behave exactly as before.
  // "WritPetitionDHC" selects the Delhi High Court writ-petition interface.
  courtType: z.enum(["SLP", "WritPetitionDHC"]).default("SLP"),
  isCommonOrder: z.boolean().default(false),
  commonOrderParties: z.array(commonOrderPartyGroupSchema).default([]),
  impugnedOrders: z.array(impugnedOrderSchema).default([impugnedOrderSchema.parse({})]),
  intraCourtAppealStatus: z.enum(["", "no_appeal_lies", "appeal_lies_but"]).default(""),
  intraCourtAppealReason: z.string().default(""),
  para1BContent: z.string().default(""),

  advocate: z.object({
    aorName: z.string().default(""),
    aorCode: z.string().default(""),
    filingDate: z.preprocess((arg) => {
      if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
    }, z.date()).default(() => new Date()),
    filingPlace: z.string().default("New Delhi"),
    wantsDrawnBy: z.boolean().default(false),
    drawnByName: z.string().default(""),
    drawnByDate: z.preprocess((arg) => {
      if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
    }, z.date()).default(() => new Date()),
    drawnByPlace: z.string().default("New Delhi"),
    wantsSettledBy: z.boolean().default(false),
    settledByName: z.string().default(""),
    settledByDate: z.preprocess((arg) => {
      if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
    }, z.date()).default(() => new Date()),
    settledByPlace: z.string().default("New Delhi"),
  }).default({}),
  
  deponent: z.object({
    name: z.string().default(""),
    relationship: z.enum(["son of", "daughter of", "wife of"]).default("son of"),
    fatherName: z.string().default(""),
    address: z.string().default(""),
    location: z.string().default(""),
    age: z.string().default(""),
    role: z.enum([
      "Petitioner", "Petitioner No. 1", "Pairokar of the Petitioner", "Pairokar of the Petitioner No. 1",
      "Authorised Representative of the Petitioner", "Authorised Representative of Petitioner No. 1",
      "Legal Guardian of the Petitioner", "Legal Guardian of Petitioner No. 1",
       "Power of Attorney Holder of the Petitioner", "Power of Attorney Holder of Petitioner No. 1"
    ]).default("Petitioner"),
  }).default({}),


  // The SLP Tab
  synopsis: z.string().default("").describe("Synopsis"),
  listOfDates: z.array(lodTableItemSchema).default(Array(10).fill(null).map(() => lodTableItemSchema.parse({}))).describe("List of Dates & Events"),
  questionsOfLaw: z.array(aamTableItemSchema).default(Array(10).fill(null).map(() => aamTableItemSchema.parse({}))).describe("Questions of Law"),
  grounds: z.array(aamTableItemSchema).default(Array(10).fill(null).map(() => aamTableItemSchema.parse({}))).describe("Grounds"),
  
  // Interim Relief
  wantsInterimRelief: z.boolean().default(false),
  interimReliefGrounds: z.array(aamTableItemSchema).default([
      aamTableItemSchema.parse({ particulars: "The Petitioner(s) have a strong prima facie case for the grounds mentioned above." }),
      aamTableItemSchema.parse({ particulars: "The balance of convenience is in favour of the Petitioner(s). No inconvenience would be caused to the Respondent(s) if the interim reliefs were granted, whereas huge inconvenience and injury would be caused to the Petitioner(s) if the interim relief prayed for were not granted." }),
      aamTableItemSchema.parse({ particulars: "Irreparable injury would be caused to the Petitioner(s) if the interim relief prayed for were not granted." })
  ]),
  interimReliefPrayers: z.array(aamTableItemSchema).default([
      aamTableItemSchema.parse({ particulars: "" }),
      aamTableItemSchema.parse({ particulars: "Pass any such other or further order(s) as this Hon'ble Court may deem fit in the facts and circumstances of this case." })
  ]),
  
  // Appendix
  wantsAppendix: z.boolean().default(false),
  appendixManualEntry: z.string().default(""),
  appendixDescription: z.string().default(""),
  useManualAppendix: z.boolean().default(false),
  appendixFile: z.any().optional(),

  // Declarations
  declarations: z.object({
      noOtherSLPFiled: z.boolean().default(true),
      annexuresTrueCopies: z.boolean().default(true),
  }).default({}),
  
  // AOR Certificate
  aorCertificate: z.object({
    confinedToPleadings: z.boolean().default(true),
    annexuresNecessary: z.boolean().default(true),
    basedOnInstructions: z.boolean().default(true),
  }).default({}),

  // IAs Tab
  standardIas: z.object({
    condonationOfDelay: z.object({
      active: z.boolean().default(false),
      delayDays: z.number().default(0),
      grounds: z.array(iaGroundItemSchema).default([iaGroundItemSchema.parse({})]),
    }).default({}),
    additionalDocuments: z.boolean().default(false),
    additionalDocumentsGrounds: z.array(aamTableItemSchema).default([aamTableItemSchema.parse({})]),
    exemptionCertifiedCopy: z.object({
        active: z.boolean().default(true),
        hasApplied: z.enum(["yes", "no"]).default("yes"),
        receiptFile: z.any().optional(),
        receiptDate: z.preprocess((arg) => {
          if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
        }, z.date()).optional(),
        reasonForNotApplying: z.string().default(""),
    }).default({}),
    exemptionOfficialTranslation: z.object({
      active: z.boolean().default(false),
      reason: z.string().default(""),       // auto: the list of translated annexures (e.g. "Annexure P-3")
      userReason: z.string().default(""),   // optional user-entered reason for not obtaining official translations
    }).default({}),
    exemptionFromSurrendering: z.object({
      active: z.boolean().default(false),
      grounds: z.array(iaGroundItemSchema).default([iaGroundItemSchema.parse({})]),
    }).default({}),
  }).default({}),
  customIas: z.array(customIaSchema).default([]),
  ias: z.array(iaSchema).default([]),

  // Listing Proforma Tab
  listingProforma: z.object({
      general: z.object({
        petitionerPhone: z.string().default(''),
        petitionerEmail: z.string().default(''),
        respondentPhone: z.string().default(''),
        respondentEmail: z.string().default(''),
        mainCategory: z.string().default(''),
        subCategory: z.string().default(''),
        specialCategory: z.enum(["N.A.", "Death Penalty", "Habeas Corpus", "Demolition of Property", "Eviction", "Bail or Anticipatory Bail"]).default('N.A.'),
        notToListBefore: z.string().default('N.A.'),
        judgesPassedImpugned: z.string().default(''),
        similarDisposed: z.string().default('None'),
        similarPending: z.string().default('None'),
        litigationOnSamePoint: z.string().default('None'),
      }).default({}),
      legalProvisions: z.array(legalProvisionSchema).default([]),
      specialCategories: z.object({
        surrenderStatus: z.enum(["N.A.", "Has Surrendered", "Has Not Surrendered"]).default('N.A.'),
        firNoAndDate: z.string().default('N.A.'),
        policeStation: z.string().default('N.A.'),
        sentenceAwarded: z.string().default('N.A.'),
        sentenceUndergone: z.string().default('N.A.'),
        taxEffect: z.string().default('N.A.'),
        vehicleNo: z.string().default('N.A.'),
        landAcqS4: z.string().default('N.A.'),
        landAcqS6: z.string().default('N.A.'),
        landAcqS17: z.string().default('N.A.'),
        petitionerCategories: z.object({
          senior: z.boolean().default(false),
          scst: z.boolean().default(false),
          woman: z.boolean().default(false),
          disabled: z.boolean().default(false),
          legalaid: z.boolean().default(false),
          custody: z.boolean().default(false),
        }).default({}),
        earlierCaseSameParties: z.enum(["Yes", "No"]).default("No"),
        firAndCaseParticulars: z.string().default('N.A.'),
        bailApplicationHistory: z.string().default('N.A.'),
      }).default({}),
  }).default({}),

  // Advocate's Checklist (15-point, per the revised requirement). Point 13 (PIL)
  // has answerable sub-parts (a)–(e); its lead-in row (q13_pil) is display-only and
  // carries no answer, so it is not a field here. declarationVerified backs the
  // attestation checkbox shown at the top of the checklist.
  checklist: z.object({
    q1_form28: yesNoSchema,
    q2_orderXV: yesNoSchema,
    q3_papersArranged: yesNoSchema,
    q4_lod: yesNoSchema,
    q5_numbering: yesNoSchema,
    q6_paperBooks: yesNoSchema,
    q7_particularsUniform: yesNoSchema,
    q8_certificate: yesNoNaSchema,
    q9_annexuresTrueCopies: yesNoSchema,
    q10_annexuresSeparate: yesNoSchema,
    q11_secondAppeal: yesNoNaSchema,
    q12_proforma: yesNoSchema,
    q13_a: yesNoNaSchema,
    q13_b: yesNoNaSchema,
    q13_c: yesNoNaSchema,
    q13_d: yesNoNaSchema,
    q13_e: yesNoNaSchema,
    q14_aft: yesNoNaSchema,
    q15_paperbooksCured: yesNoSchema,
    declarationVerified: z.boolean().default(false),
  }).default({}),

  // ── Writ Petition (Delhi High Court) ────────────────────────────────────────
  // All WP-specific data lives here so the SLP shape is untouched. Active only
  // when courtType === "WritPetitionDHC". Reuses the shared petitioners /
  // respondents / deponent / synopsis / listOfDates / grounds fields above.
  wp: z.object({
    // Jurisdiction basis printed in the cause title and the petition body.
    articleBasis: z.enum(["226", "227", "226 read with 227"]).default("226 read with 227"),
    // Date the Notice of Motion says the matter is "likely to be listed on".
    listingDate: z.preprocess((arg) => {
      if (typeof arg == "string" || arg instanceof Date) return new Date(arg);
    }, z.date()).default(() => new Date()),
    // IO writ: the impugned order is the first annexure(s) (marked via
    // annexure.isImpugnedOrder) and relief (a) auto-quashes it.
    isIoWrit: z.boolean().default(false),
    // Reliefs — single source of truth (lettered list). The last item is the
    // residuary prayer, auto-omitted from the top reliefs block and the intro.
    reliefs: z.array(aamTableItemSchema).default([
      aamTableItemSchema.parse({}),
      aamTableItemSchema.parse({ particulars: "Pass any such other order(s) as this Hon'ble Court may deem fit in the facts and circumstances of this case." }),
    ]),
    // Facts section: transposed from the List of Dates by the AI assistant, then
    // hand-editable. `factsEdited` suppresses auto-regeneration once touched.
    facts: z.string().default(""),
    factsEdited: z.boolean().default(false),
    // Optionally split Synopsis and List of Dates onto separate pages.
    splitSynopsisAndLod: z.boolean().default(false),
    // "Filed by" advocate block (the High Court has no Advocate-on-Record).
    advocate: z.object({
      name: z.string().default(""),
      firm: z.string().default(""),
      address: z.string().default(""),
      enrolmentNo: z.string().default(""),
      email: z.string().default(""),
      phone: z.string().default(""),
    }).default({}),
    // CM applications: three standard (each toggleable) + custom (A-series
    // annexures, reusing the SLP custom-IA shape).
    cms: z.object({
      // Each standard CM follows the SLP-IA pattern: frozen opening + closing +
      // prayer lead-in are generated; only the middle `body` paras and `prayers`
      // are editable (pre-seeded). The user can edit them and insert paras in the
      // middle. The last prayer is the residuary placeholder.
      stay: z.object({
        active: z.boolean().default(false), // IO writs: stay of the impugned order
        body: z.array(aamTableItemSchema).default([
          aamTableItemSchema.parse({ particulars: "The Petitioner has a strong prima facie case and the balance of convenience lies in favour of the Petitioner. Irreparable injury would be caused to the Petitioner if the operation of the Impugned Order is not stayed during the pendency of the writ petition." }),
        ]),
        prayers: z.array(aamTableItemSchema).default([
          aamTableItemSchema.parse({ particulars: "Stay the operation of the Impugned Order during the pendency of the present writ petition; and" }),
          aamTableItemSchema.parse({ particulars: "Pass any such other order(s) as this Hon’ble Court may deem fit in the facts and circumstances of this case." }),
        ]),
      }).default({}),
      lengthySynopsis: z.object({
        active: z.boolean().default(false),
        body: z.array(aamTableItemSchema).default([
          aamTableItemSchema.parse({ particulars: "Only those facts essential to the present Petition have been detailed in the Synopsis and List of Dates, which are nonetheless lengthy in view of the complex and intricate set of facts and circumstances of the present case." }),
        ]),
        prayers: z.array(aamTableItemSchema).default([
          aamTableItemSchema.parse({ particulars: "Permit the Petitioner to file a lengthy Synopsis and List of Dates and exempt the Petitioner from complying with the applicable rules pertaining to filing a brief Synopsis and List of Dates; and" }),
          aamTableItemSchema.parse({ particulars: "Pass any such other order(s) as this Hon’ble Court may deem fit in the facts and circumstances of this case." }),
        ]),
      }).default({}),
      exemptionCopies: z.object({
        active: z.boolean().default(false),
        body: z.array(aamTableItemSchema).default([
          aamTableItemSchema.parse({ particulars: "The annexures to the writ petition are being filed on an urgent basis; some may not be legible or clear, or available as certified or true typed copies with the prescribed margins and spacing. The Petitioner undertakes to furnish clear/typed copies of the same if so directed by this Hon’ble Court." }),
        ]),
        prayers: z.array(aamTableItemSchema).default([
          aamTableItemSchema.parse({ particulars: "Exempt the Petitioner from filing legible/clear copies, certified copies or true typed copies of the annexures to the writ petition; and" }),
          aamTableItemSchema.parse({ particulars: "Pass any such other order(s) as this Hon’ble Court may deem fit in the facts and circumstances of this case." }),
        ]),
      }).default({}),
    }).default({}),
    customCms: z.array(customIaSchema).default([]),
    // Upload-only filing documents, merged into the paper-book at PDF time.
    // signedAffidavit / signedVakalatnama, when present, replace the generated
    // clean versions (the client signs/notarises and uploads the PDF).
    uploads: z.object({
      courtFee: collyDocumentSchema.pick({ file: true, filePath: true }).default({}),
      proofOfService: collyDocumentSchema.pick({ file: true, filePath: true }).default({}),
      signedAffidavit: collyDocumentSchema.pick({ file: true, filePath: true }).default({}),
      signedVakalatnama: collyDocumentSchema.pick({ file: true, filePath: true }).default({}),
    }).default({}),
  }).default({}),

  // PDF Generation Dialog state
  pdfMergeItems: z.array(pdfMergeItemSchema).optional(),

  // Legacy fields to be removed, kept for compatibility during transition
  caseTitle: z.string().default("").optional(),
  impugnedOrderDate: z.date().optional(),
});

export type DraftoProject = z.infer<typeof draftoProjectSchema>;
export type AamTableItem = z.infer<typeof aamTableItemSchema>;
export type IaGroundItem = z.infer<typeof iaGroundItemSchema>;
export type LodTableItem = z.infer<typeof lodTableItemSchema>;
export type Annexure = z.infer<typeof annexureSchema>;
export type IaAnnexure = z.infer<typeof iaAnnexureSchema>;
export type VaadiTableItem = z.infer<typeof vaadiTableItemSchema>;
export type ImpugnedOrder = z.infer<typeof impugnedOrderSchema>;
export type CustomIa = z.infer<typeof customIaSchema>;
export type PdfMergeItem = z.infer<typeof pdfMergeItemSchema>;
    

    

    




