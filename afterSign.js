exports.default = async function afterSign(context) {
  // Notarization is handled separately in CI via xcrun notarytool
  // This hook intentionally left empty
};
