const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  const keyId = process.env.APPLE_API_KEY_ID;
  const issuerId = process.env.APPLE_API_ISSUER;
  const keyPath = process.env.APPLE_API_KEY;

  if (!keyId || !issuerId || !keyPath) {
    console.log('Skipping notarization: APPLE_API_KEY, APPLE_API_KEY_ID, or APPLE_API_ISSUER not set');
    return;
  }

  console.log(`Notarizing ${appPath}...`);
  await notarize({
    tool: 'notarytool',
    appPath,
    appleApiKey: keyPath,
    appleApiKeyId: keyId,
    appleApiIssuer: issuerId,
  });
  console.log('Notarization complete');
};
