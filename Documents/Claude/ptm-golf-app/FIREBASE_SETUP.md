# Firebase Setup Guide for Production

## Current Status
- **Local Dev:** Uses localStorage (works without Firebase config)
- **Production:** Should use Firebase Firestore for cloud persistence

## Step 1: Firebase Security Rules

Replace your Firestore security rules with these (in Firebase Console):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow users to read/write their own event data
    match /events/{eventId} {
      allow read, write: if request.auth != null && 
                            (resource == null || 
                             resource.data.ownerId == request.auth.uid);
    }
    
    // Allow authenticated users to read/write scores
    match /scores/{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Deny everything else by default
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Step 2: Environment Variables for Vercel

Add these to your Vercel environment variables:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## Step 3: Deployment Checklist

- [ ] Firebase security rules updated
- [ ] Vercel environment variables configured
- [ ] Test scoring works on production
- [ ] Test Day 1 → Day 2 score persistence
- [ ] Test offline then online sync (if needed)

## Switching to Firebase-First (Optional)

When ready, set this env var:
```
NEXT_PUBLIC_USE_FIREBASE_PRIMARY=true
```

The app will then:
1. Try Firebase first
2. Fall back to localStorage if Firebase fails
3. Sync both for redundancy

## Troubleshooting

**Scores not saving:**
- Check Firebase security rules (most common issue)
- Verify user is authenticated
- Check browser console for Firebase errors

**Slow on first load:**
- Firebase operations may be slower than localStorage
- Consider implementing a cache layer
- Monitor Firestore read/write operations in Firebase Console

## Local Development

No changes needed - localStorage works without Firebase setup.
