// Whether the Original Application (CAT) mode is exposed in the UI.
//
// Like the Writ Petition mode ([[wp-enabled]]), it is shown only in dev
// (`import.meta.env.DEV`) or when VITE_ENABLE_OA=true at build time. Production
// SLP builds never see it and behave exactly as before.
export const OA_ENABLED: boolean =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_OA === "true";
