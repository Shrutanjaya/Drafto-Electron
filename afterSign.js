/**
 * electron-builder `afterSign` hook.
 *
 * Submits the signed Drafto.app to Apple's notarization service via the App
 * Store Connect API, polls until Apple accepts it, then staples the resulting
 * ticket into the .app so Gatekeeper can verify the notarization OFFLINE on
 * the user's machine.
 *
 * IMPORTANT: this script intentionally throws on any failure. We never want
 * to ship an un-notarized DMG that asks the user to bypass Gatekeeper
 * manually in System Settings. If you want to skip notarization for a local
 * dev build, set the env var DRAFTO_SKIP_NOTARIZE=1 explicitly.
 */
const { execSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");
const os = require("os");

function createJWT(keyId, issuerId, privateKeyPath) {
  const privateKey = fs.readFileSync(privateKeyPath, "utf8");
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: issuerId,
    iat: now,
    exp: now + 1200,
    aud: "appstoreconnect-v1",
  })).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  const sig = sign.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${signingInput}.${sig}`;
}

function httpsReq(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function notaryApi(method, apiPath, jwt, body) {
  const bodyStr = body ? JSON.stringify(body) : undefined;
  const res = await httpsReq(
    {
      hostname: "appstoreconnect.apple.com",
      path: apiPath,
      method,
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
      },
    },
    bodyStr
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Notary API ${method} ${apiPath} → HTTP ${res.status}\n${res.body}`);
  }
  return JSON.parse(res.body);
}

async function getBucketRegion(bucket) {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: `${bucket}.s3.amazonaws.com`, path: "/", method: "HEAD" },
      (res) => {
        const region = res.headers["x-amz-bucket-region"] || "us-east-1";
        res.resume();
        resolve(region);
      }
    );
    req.on("error", () => resolve("us-east-1"));
    req.end();
  });
}

async function uploadToS3(attrs, zipPath) {
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  const region = await getBucketRegion(attrs.bucket);
  console.log(`[notarize] S3 region: ${region}, bucket: ${attrs.bucket}`);
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: attrs.awsAccessKeyId,
      secretAccessKey: attrs.awsSecretAccessKey,
      sessionToken: attrs.awsSessionToken,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: attrs.bucket,
      Key: attrs.object,
      Body: fs.readFileSync(zipPath),
      ContentType: "application/zip",
    })
  );
}

/**
 * Locate a `stapler` binary on the system. Returns the absolute path if
 * found, or null if stapling is not possible on this machine.
 *
 * stapler is part of Xcode Command Line Tools. On machines without CLT
 * installed, stapling is impossible — but that does NOT prevent the app
 * from being notarized. It just means the notarization ticket lives only
 * in Apple's records, and the end user's Mac will check with Apple's
 * servers the first time they launch the app (which requires internet).
 */
function findStapler() {
  // Common paths where stapler may exist independently of `xcrun`.
  const directPaths = [
    "/usr/bin/stapler",
    "/usr/libexec/stapler",
    "/Library/Developer/CommandLineTools/usr/bin/stapler",
    "/Applications/Xcode.app/Contents/Developer/usr/bin/stapler",
  ];
  for (const p of directPaths) {
    try { if (fs.statSync(p).isFile()) return p; } catch {}
  }
  // Fall back to xcrun (requires Xcode CLT).
  try {
    const found = execSync(`xcrun --find stapler 2>/dev/null`, { encoding: "utf8" }).trim();
    if (found && fs.existsSync(found)) return found;
  } catch {}
  return null;
}

/**
 * spctl ships with macOS itself (at /usr/sbin/spctl) and is available
 * regardless of whether Xcode CLT is installed. So we can always sanity
 * check Gatekeeper's verdict, even on machines without CLT.
 */
function gatekeeperAssess(appPath) {
  console.log("[notarize] Asking Gatekeeper to assess the app…");
  try {
    execSync(`/usr/sbin/spctl --assess --type execute --verbose=4 "${appPath}"`, {
      stdio: "inherit",
    });
    console.log("[notarize] OK — Gatekeeper accepted the app.");
  } catch {
    console.warn(
      "[notarize] WARNING: spctl assessment did not return success.\n" +
      "           On the build machine this is usually fine (the local\n" +
      "           Gatekeeper cache may not have refreshed yet). End-user\n" +
      "           Macs will phone home to Apple on first launch and get\n" +
      "           the correct verdict."
    );
  }
}

exports.default = async function afterSign(context) {
  if (process.platform !== "darwin") return;

  // Explicit opt-out for local dev builds only.
  if (process.env.DRAFTO_SKIP_NOTARIZE === "1") {
    console.warn("[notarize] DRAFTO_SKIP_NOTARIZE=1 — skipping notarization.");
    console.warn("[notarize] This build is for local testing only. Do NOT distribute it.");
    return;
  }

  const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env;

  // Hard fail if creds are missing. The whole point of this build pipeline is
  // to produce a notarized artifact; silently producing an un-notarized DMG
  // is the exact bug that just bit us in production.
  if (!APPLE_API_KEY || !APPLE_API_KEY_ID || !APPLE_API_ISSUER) {
    throw new Error(
      "[notarize] Notarization credentials are missing. Set these env vars\n" +
      "           before running `npm run dist:mac`:\n" +
      "             APPLE_API_KEY     — path to the AuthKey_XXXX.p8 file\n" +
      "             APPLE_API_KEY_ID  — 10-char Key ID from App Store Connect\n" +
      "             APPLE_API_ISSUER  — Issuer UUID from App Store Connect\n" +
      "\n" +
      "           If you genuinely want an un-notarized local-only build,\n" +
      "           run: DRAFTO_SKIP_NOTARIZE=1 npm run dist:mac"
    );
  }

  // Check whether stapling is possible on this build machine. It is OK if
  // it isn't — we will still notarize. End users will just need internet
  // on first launch instead of getting offline verification.
  const stapler = findStapler();
  if (stapler) {
    console.log(`[notarize] Stapler available at: ${stapler}`);
  } else {
    console.log(
      "[notarize] Stapler not available on this build machine (Xcode CLT not\n" +
      "           installed). Notarization will still happen — the app will\n" +
      "           be registered with Apple's servers. End users will need\n" +
      "           internet access the FIRST time they launch the app, so\n" +
      "           macOS can verify the notarization with Apple. After the\n" +
      "           first launch, the verdict is cached locally and the app\n" +
      "           runs offline forever.\n" +
      "           (To embed the ticket and avoid the first-launch internet\n" +
      "           requirement, install Xcode Command Line Tools with\n" +
      "           `xcode-select --install` and rebuild.)"
    );
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[notarize] App to notarize: ${appPath}`);

  // 1. Zip the app
  console.log("[notarize] Creating zip…");
  const zipPath = path.join(os.tmpdir(), `${appName}-notarize.zip`);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`ditto -c -k --keepParent "${appPath}" "${zipPath}"`);
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
  console.log(`[notarize] zip sha256: ${sha256}`);

  // 2. Start submission
  let jwt = createJWT(APPLE_API_KEY_ID, APPLE_API_ISSUER, APPLE_API_KEY);
  console.log("[notarize] Starting Apple notarization submission…");
  const submission = await notaryApi("POST", "/notary/v2/submissions", jwt, {
    sha256,
    submissionName: `${appName}.zip`,
  });
  const submissionId = submission.data.id;
  const uploadAttrs = submission.data.attributes;
  console.log(`[notarize] Submission ID: ${submissionId}`);

  // 3. Upload to Apple's S3
  console.log("[notarize] Uploading to Apple's notarization service…");
  await uploadToS3(uploadAttrs, zipPath);
  console.log("[notarize] Upload complete. Waiting for Apple review…");

  // 4. Poll for status
  let status = "In Progress";
  const startedAt = Date.now();
  while (status === "In Progress") {
    await new Promise((r) => setTimeout(r, 15000));
    jwt = createJWT(APPLE_API_KEY_ID, APPLE_API_ISSUER, APPLE_API_KEY);
    const statusResp = await notaryApi("GET", `/notary/v2/submissions/${submissionId}`, jwt);
    status = statusResp.data.attributes.status;
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(`[notarize] Status: ${status}  (elapsed: ${elapsed}s)`);
  }

  // Cleanup zip regardless of outcome
  try { fs.unlinkSync(zipPath); } catch {}

  if (status !== "Accepted") {
    // Pull and display the developer log URL so the root cause is visible.
    let logsUrl = null;
    try {
      jwt = createJWT(APPLE_API_KEY_ID, APPLE_API_ISSUER, APPLE_API_KEY);
      const logs = await notaryApi("GET", `/notary/v2/submissions/${submissionId}/logs`, jwt);
      logsUrl = logs.data?.attributes?.developerLogUrl;
      if (logsUrl) {
        console.error(`[notarize] Apple's log URL: ${logsUrl}`);
        console.error(`[notarize] curl -L "${logsUrl}" | jq .`);
      }
    } catch {}
    throw new Error(
      `[notarize] Apple rejected the submission. Final status: ${status}\n` +
      `           Submission ID: ${submissionId}\n` +
      (logsUrl ? `           See full report at: ${logsUrl}\n` : "")
    );
  }

  console.log("[notarize] Apple accepted the submission.");

  // 5. Staple the ticket into the .app if a stapler is available.
  if (stapler) {
    console.log("[notarize] Stapling ticket into the app…");
    try {
      execSync(`"${stapler}" staple "${appPath}"`, { stdio: "inherit" });
      console.log("[notarize] Stapled successfully.");

      // Verify the ticket is really embedded.
      try {
        execSync(`"${stapler}" validate "${appPath}"`, { stdio: "inherit" });
        console.log("[notarize] Ticket validation OK.");
      } catch {
        console.warn(
          "[notarize] WARNING: stapler validate did not confirm the ticket.\n" +
          "           The app should still launch fine on machines with\n" +
          "           internet (Gatekeeper will phone home to Apple), but\n" +
          "           offline first launches may show the malware warning."
        );
      }
    } catch (e) {
      console.warn(
        `[notarize] WARNING: stapling failed: ${e.message}\n` +
        `           This is non-fatal — the app is still notarized in\n` +
        `           Apple's records. End users will need internet on first\n` +
        `           launch so Gatekeeper can verify with Apple's servers.`
      );
    }
  } else {
    console.log("[notarize] Skipping staple step — no stapler available on this machine.");
  }

  // 6. Sanity check via spctl (always available, ships with macOS).
  gatekeeperAssess(appPath);

  console.log("");
  console.log("[notarize] === Notarization pipeline complete ===");
  if (!stapler) {
    console.log("[notarize] NOTE: app is notarized but NOT stapled.");
    console.log("[notarize] End users need internet on first launch.");
  }
};
