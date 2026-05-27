import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize the Firebase app
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Sheets edit/read scope
provider.addScope('https://www.googleapis.com/auth/spreadsheets');

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory and retrieve from storage on startup.
let cachedAccessToken: string | null = null;

if (typeof window !== 'undefined') {
  const token = localStorage.getItem('google_sheets_access_token');
  const timestampStr = localStorage.getItem('google_sheets_token_timestamp');
  if (token && timestampStr) {
    const timestamp = parseInt(timestampStr, 10);
    // Google OAuth standard tokens expire after 1 hour (3600000ms).
    // We check against a 50 minutes threshold (3000000ms) for high stability.
    if (Date.now() - timestamp < 3000000) {
      cachedAccessToken = token;
    } else {
      localStorage.removeItem('google_sheets_access_token');
      localStorage.removeItem('google_sheets_token_timestamp');
    }
  }
}

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      localStorage.removeItem('google_sheets_access_token');
      localStorage.removeItem('google_sheets_token_timestamp');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    localStorage.setItem('google_sheets_access_token', cachedAccessToken);
    localStorage.setItem('google_sheets_token_timestamp', String(Date.now()));
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  localStorage.removeItem('google_sheets_access_token');
  localStorage.removeItem('google_sheets_token_timestamp');
};
