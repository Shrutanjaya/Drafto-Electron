// Whether subscription entitlement + device-seat enforcement is ACTIVE.
//
// Gated like the WP/OA features so a beta build can ship the drafting work
// without changing anyone's billing or login behaviour:
//   • dev (`import.meta.env.DEV`) → on, so it can be exercised with the
//     entitlement simulator;
//   • packaged builds → on ONLY when VITE_ENABLE_ENTITLEMENT=true at build time.
//
// When off, the app behaves exactly as it did before this layer existed:
// everything is editable and exportable, and no device limit is applied.
export const ENTITLEMENT_ENABLED: boolean =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_ENTITLEMENT === "true";
