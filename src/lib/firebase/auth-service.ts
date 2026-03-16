import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  updateProfile,
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc, 
  updateDoc, 
  serverTimestamp,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { auth, db } from './config';

// Types
export interface UserSession {
  deviceId: string;
  deviceInfo: {
    os: string;
    hostname: string;
    appVersion: string;
  };
  ipAddress: string;
  loginTime: Date;
  lastHeartbeat: Date;
  isActive: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

// Generate unique device ID
// In Electron, you can use machine-id from the main process
// For now, we'll use a combination of browser fingerprint
export function generateDeviceId(): string {
  // This will be replaced with actual device ID from Electron
  const stored = localStorage.getItem('deviceId');
  if (stored) return stored;
  
  const deviceId = `web-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  localStorage.setItem('deviceId', deviceId);
  return deviceId;
}

// Get device info
export function getDeviceInfo() {
  return {
    os: navigator.platform,
    hostname: window.location.hostname,
    appVersion: '1.0.0', // Replace with actual app version
  };
}

// Get IP address (simplified - in production, call a service)
async function getIpAddress(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error('Error getting IP:', error);
    return 'unknown';
  }
}

// Authentication Service
export class AuthService {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionUnsubscribe: Unsubscribe | null = null;
  private tokenValidationInterval: NodeJS.Timeout | null = null;

  /**
   * Sign up a new user
   */
  async signUp(email: string, password: string, displayName: string): Promise<User> {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update profile with display name
    await updateProfile(user, { displayName });

    // Create user profile in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName,
      createdAt: serverTimestamp(),
    });

    return user;
  }

  /**
   * Sign in with Google via IPC-obtained tokens (PKCE desktop flow)
   */
  async signInWithGoogleCredential(idToken: string, accessToken: string): Promise<User> {
    const deviceId = generateDeviceId();
    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    const userCredential = await signInWithCredential(auth, credential);
    const user = userCredential.user;

    // Upsert Firestore profile
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        email: user.email,
        displayName: user.displayName || user.email,
        createdAt: serverTimestamp(),
      });
    }

    // Session bookkeeping (same as email/password flow)
    const ipAddress = await getIpAddress();
    await setDoc(doc(db, 'sessions', user.uid), {
      deviceId,
      deviceInfo: getDeviceInfo(),
      ipAddress,
      loginTime: serverTimestamp(),
      lastHeartbeat: serverTimestamp(),
      isActive: true,
    });

    this.startHeartbeat(user.uid);
    this.listenToSessionChanges(user.uid, deviceId);
    this.startPeriodicValidation();

    return user;
  }

  /**
   * Sign in with email and password
   * Enforces single-device login
   */
  async signIn(email: string, password: string): Promise<{ user: User; wasForceLogout: boolean }> {
    const deviceId = generateDeviceId();
    
    // First, authenticate the user
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Check for existing active session
    const sessionRef = doc(db, 'sessions', user.uid);
    const sessionSnap = await getDoc(sessionRef);
    
    let wasForceLogout = false;

    if (sessionSnap.exists()) {
      const existingSession = sessionSnap.data() as UserSession;
      
      // If different device, force logout the other session
      if (existingSession.deviceId !== deviceId && existingSession.isActive) {
        wasForceLogout = true;
        // The other device will be automatically logged out via session listener
      }
    }

    // Create or update session for this device
    const ipAddress = await getIpAddress();
    await setDoc(sessionRef, {
      deviceId,
      deviceInfo: getDeviceInfo(),
      ipAddress,
      loginTime: serverTimestamp(),
      lastHeartbeat: serverTimestamp(),
      isActive: true,
    });

    // Start heartbeat
    this.startHeartbeat(user.uid);

    // Listen for session changes (force logout from another device)
    this.listenToSessionChanges(user.uid, deviceId);

    // Start periodic token validation (every 5 minutes)
    this.startPeriodicValidation();

    return { user, wasForceLogout };
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    const user = auth.currentUser;
    if (!user) return;

    // Stop heartbeat
    this.stopHeartbeat();

    // Stop periodic validation
    this.stopPeriodicValidation();

    // Stop listening to session changes
    if (this.sessionUnsubscribe) {
      this.sessionUnsubscribe();
      this.sessionUnsubscribe = null;
    }

    // Delete session from Firestore
    await deleteDoc(doc(db, 'sessions', user.uid));

    // Sign out from Firebase Auth
    await firebaseSignOut(auth);
  }

  /**
   * Start heartbeat to keep session alive
   * Updates every 10 minutes
   */
  private startHeartbeat(userId: string) {
    // Clear any existing heartbeat
    this.stopHeartbeat();

    // Update immediately
    this.updateHeartbeat(userId);

    // Update every 10 minutes (600 seconds)
    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat(userId);
    }, 10 * 60 * 1000);
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Update heartbeat timestamp
   */
  private async updateHeartbeat(userId: string) {
    try {
      const sessionRef = doc(db, 'sessions', userId);
      await updateDoc(sessionRef, {
        lastHeartbeat: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating heartbeat:', error);
    }
  }

  /**
   * Listen to session changes for force logout
   */
  private listenToSessionChanges(userId: string, currentDeviceId: string) {
    const sessionRef = doc(db, 'sessions', userId);
    
    this.sessionUnsubscribe = onSnapshot(sessionRef, (snapshot) => {
      if (!snapshot.exists()) {
        // Session deleted, force logout
        this.forceLogout();
        return;
      }

      const session = snapshot.data() as UserSession;
      
      // If session is for a different device, we've been logged out
      if (session.deviceId !== currentDeviceId) {
        this.forceLogout();
      }
    });
  }

  /**
   * Force logout (called when logged in from another device)
   */
  private async forceLogout() {
    this.stopHeartbeat();
    if (this.sessionUnsubscribe) {
      this.sessionUnsubscribe();
      this.sessionUnsubscribe = null;
    }
    
    // Don't delete session (already done by new login)
    await firebaseSignOut(auth);
    
    // Notify user (you can use a toast or modal)
    window.dispatchEvent(new CustomEvent('force-logout', {
      detail: { reason: 'Logged in from another device' }
    }));
  }

  /**
   * Listen to auth state changes
   */
  onAuthStateChanged(callback: (user: User | null) => void): Unsubscribe {
    return onAuthStateChanged(auth, callback);
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return auth.currentUser;
  }

  /**
   * Send password reset email
   */
  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
  }

  /**
   * Update user password (requires recent authentication)
   */
  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email) {
      throw new Error('No user logged in');
    }

    // Re-authenticate user
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Update password
    await updatePassword(user, newPassword);
  }

  /**
   * Update user profile
   */
  async updateProfile(displayName: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user logged in');
    }

    await updateProfile(user, { displayName });
    
    // Update in Firestore
    await updateDoc(doc(db, 'users', user.uid), {
      displayName,
    });
  }

  /**
   * Get user profile from Firestore
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return null;
    
    const data = userDoc.data();
    return {
      uid: userId,
      email: data.email,
      displayName: data.displayName,
      createdAt: data.createdAt?.toDate(),
    };
  }

  /**
   * Check if user has an active session
   */
  async hasActiveSession(userId: string): Promise<boolean> {
    const sessionDoc = await getDoc(doc(db, 'sessions', userId));
    if (!sessionDoc.exists()) return false;
    
    const session = sessionDoc.data() as UserSession;
    return session.isActive;
  }

  /**
   * Validate user token by forcing a refresh
   * This checks if the user account is still enabled and valid
   * @returns true if token is valid, false if user is disabled/deleted
   */
  async validateToken(): Promise<{ valid: boolean; error?: string }> {
    try {
      const user = auth.currentUser;
      if (!user) {
        return { valid: false, error: 'No user logged in' };
      }

      // Force token refresh - this will fail if user is disabled
      await user.getIdToken(true);
      
      return { valid: true };
    } catch (error: any) {
      console.error('Token validation failed:', error);
      
      // Check specific error codes
      if (error.code === 'auth/user-disabled') {
        return { valid: false, error: 'Your account has been disabled' };
      } else if (error.code === 'auth/user-not-found') {
        return { valid: false, error: 'Your account no longer exists' };
      } else if (error.code === 'auth/network-request-failed') {
        // Network error - assume valid for now (offline)
        console.warn('Network error during token validation - allowing offline work');
        return { valid: true };
      }
      
      return { valid: false, error: 'Authentication failed. Please log in again.' };
    }
  }

  /**
   * Start periodic token validation (every 5 minutes)
   * This checks if the user account is still enabled
   */
  startPeriodicValidation() {
    // Stop any existing validation
    this.stopPeriodicValidation();

    // Validate immediately
    this.performPeriodicValidation();

    // Validate every 5 minutes (300,000 milliseconds)
    this.tokenValidationInterval = setInterval(() => {
      this.performPeriodicValidation();
    }, 5 * 60 * 1000);

    console.log('[Auth] Started periodic token validation (every 5 minutes)');
  }

  /**
   * Stop periodic token validation
   */
  stopPeriodicValidation() {
    if (this.tokenValidationInterval) {
      clearInterval(this.tokenValidationInterval);
      this.tokenValidationInterval = null;
      console.log('[Auth] Stopped periodic token validation');
    }
  }

  /**
   * Perform the actual validation check
   */
  private async performPeriodicValidation() {
    const result = await this.validateToken();
    
    if (!result.valid && result.error !== 'No user logged in') {
      console.error('[Auth] Periodic validation failed:', result.error);
      
      // Force logout
      this.stopPeriodicValidation();
      this.stopHeartbeat();
      await firebaseSignOut(auth);
      
      // Notify user
      window.dispatchEvent(new CustomEvent('force-logout', {
        detail: { reason: result.error || 'Your session is no longer valid' }
      }));
    } else if (result.valid) {
      console.log('[Auth] Periodic validation passed');
    }
  }
}

// Export singleton instance
export const authService = new AuthService();
