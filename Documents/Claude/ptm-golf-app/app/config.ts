// Storage configuration for local dev vs production
export const STORAGE_CONFIG = {
  // Set to 'firebase' for production, 'localstorage' for development
  // Default: 'localstorage' (works without Firebase config)
  PRIMARY_STORAGE: (process.env.NEXT_PUBLIC_USE_FIREBASE_PRIMARY === 'true' ? 'firebase' : 'localstorage') as 'firebase' | 'localstorage',

  // Enable detailed logging for debugging
  DEBUG: process.env.NODE_ENV === 'development',

  // Keys for localStorage
  SCORES_KEY_PREFIX: 'golf-scores',
  ALL_SCORES_KEY: 'golf-all-scores',
  EVENT_KEY_PREFIX: 'golf-event',
};

// Helper functions for choosing storage strategy
export function shouldUseFirebaseFirst(): boolean {
  return STORAGE_CONFIG.PRIMARY_STORAGE === 'firebase';
}

export function shouldUseLocalStorageFirst(): boolean {
  return STORAGE_CONFIG.PRIMARY_STORAGE === 'localstorage';
}

export function log(message: string, data?: any) {
  if (STORAGE_CONFIG.DEBUG) {
    console.log(`[Golf Storage] ${message}`, data);
  }
}
