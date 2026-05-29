import { ipcInvoke } from './index';

interface GoogleAuthResult {
  idToken: string;
  accessToken: string;
}

/**
 * Starts the Google OAuth PKCE flow via the Electron main process.
 * Opens the system browser for the user to sign in, then exchanges the
 * authorization code for tokens using the drafto:// custom protocol callback.
 *
 * Requires VITE_GOOGLE_CLIENT_ID in .env (Desktop app OAuth client from GCP).
 */
export async function startGoogleAuth(clientId: string): Promise<GoogleAuthResult> {
  return ipcInvoke<GoogleAuthResult>('google-auth-start', { clientId });
}
