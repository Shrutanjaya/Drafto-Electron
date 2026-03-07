const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  const keyId = process.env.APPLE_API_KEY_ID;
  const issuerId = process.env.APPLE_API_ISSUER_ID;
  const keyPath = process.env.APPLE_API_KEY_PATH;

  if (!keyId || !issuerId || !keyPath) {
    console.log('Skipping notarization: APPLE_API_KEY_ID, APPLE_API_ISSUER_ID, or APPLE_API_KEY_PATH not set');
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
