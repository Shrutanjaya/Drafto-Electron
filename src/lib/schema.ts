
import { z } from "zod";

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
        similarDisposed: z.string().default('N.A.'),
        similarPending: z.string().default('N.A.'),
        litigationOnSamePoint: z.string().default('N.A.'),
      }).default({}),
      legalProvisions: z.array(legalProvisionSchema).default([]),
      specialCategories: z.object({
        surrenderStatus: z.enum(["N.A.", "Has Surrendered", "Has Not Surrendered"]).default('N.A.'),
        firNo: z.string().default('N.A.'),
        firDate: z.string().default('N.A.'),
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

  // Advocate's Checklist
  checklist: z.object({
    q1_form28: yesNoSchema,
    q1_courtFee: yesNoSchema,
    q2_paperBooks: yesNoSchema,
    q2_lod: yesNoSchema,
    q2_numbering: yesNoSchema,
    q3_legible: yesNoSchema,
    q4_signatures: yesNoSchema,
    q5_affidavit: yesNoSchema,
    q6_vernacular: yesNoNaSchema,
    q7_lrs: yesNoNaSchema,
    q8_vakalatnama: yesNoSchema,
    q8_poa: yesNoNaSchema,
    q8_registeredBody: yesNoSchema.default("No"),
    q8_regCopy: yesNoNaSchema,
    q8_authority: yesNoNaSchema,
    q8_authorityProof: yesNoNaSchema,
    q9_statement: yesNoSchema,
    q10_certifiedCopy: yesNoSchema,
    q11_particularsUniform: yesNoSchema,
    q12_addresses: yesNoSchema,
    q12_causeTitle: yesNoSchema,
    q13_certificate: yesNoNaSchema,
    q14_delay: yesNoNaSchema,
    q15_annexures: yesNoSchema,
    q16_pleadings: yesNoSchema.default("Yes"),
    q16_additionalDocs: yesNoNaSchema,
    q17_secondAppeal: yesNoNaSchema,
    q17_undertaking: yesNoNaSchema,
    q18_surrender: yesNoNaSchema,
    q18_exemption: yesNoNaSchema,
    q19_firQuashing: yesNoNaSchema,
    q20_anticipatoryBail: yesNoNaSchema,
    q21_proforma: yesNoSchema,
    q21_identicalMatter: yesNoNaSchema,
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
    

    

    




