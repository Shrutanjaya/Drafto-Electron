// Whether the Writ Petition (Delhi HC) mode is exposed in the UI.
//
// It is shown only when running in dev (`npm run electron:dev`, where
// import.meta.env.DEV is true). Production builds distributed to SLP customers
// have it false, so they never see the startup mode prompt or the WP option and
// behave exactly like the plain SLP app.
//
// Escape hatch: set VITE_ENABLE_WP=true at build time to force-enable it in a
// packaged build (e.g. an internal beta) without changing code.
export const WP_ENABLED: boolean =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_WP === "true";
