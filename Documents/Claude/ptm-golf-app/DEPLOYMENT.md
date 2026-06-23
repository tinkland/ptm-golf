# PTM Golf Scoring App - Deployment Guide

## Architecture Overview

The app uses a **tiered storage strategy** for maximum reliability:

```
Local Development (localhost:3022)
├── Primary: localStorage (instant, no setup needed)
└── Secondary: Firebase (optional, fails gracefully)

Production (Vercel)
├── Primary: Firebase (cloud persistence, multi-device)
└── Secondary: localStorage (offline backup)
```

---

## Phase 1: Local Development (Current State ✅)

**Status:** Working perfectly with localStorage

**How it works:**
1. User scores → instantly saved to localStorage
2. Finish Round → loads from localStorage
3. Firebase errors ignored (no config needed)
4. All scores persist in browser

**No action needed** - keep testing locally as-is.

---

## Phase 2: Prepare for Production

### Step 1: Set Up Firebase (Console)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to **Firestore Database** → **Rules**
4. Replace rules with content from `FIREBASE_SETUP.md`
5. Publish rules

### Step 2: Get Firebase Credentials

1. In Firebase Console: **Project Settings** → **Service Accounts**
2. Copy your **Web API credentials**
3. Save them securely

### Step 3: Set Vercel Environment Variables

On Vercel dashboard:
1. Go to your project → **Settings** → **Environment Variables**
2. Add the variables from `FIREBASE_SETUP.md`
3. Make sure they have `NEXT_PUBLIC_` prefix for client-side access

Example:
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=golf-scoring-app
etc.
```

---

## Phase 3: Deploy to Vercel

### Option A: Automatic (Recommended)
```bash
# Connect your repo to Vercel
# Every push to main → automatic deployment
```

### Option B: Manual
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from project directory
vercel
```

---

## Phase 4: Enable Firebase as Primary (Optional)

Once deployed and Firebase is confirmed working:

1. In Vercel Environment Variables, add:
```
NEXT_PUBLIC_USE_FIREBASE_PRIMARY=true
```

2. This switches the app to:
   - Try Firebase first (cloud persistence)
   - Fall back to localStorage if offline

**Keep localStorage enabled** - it provides redundancy and offline capability.

---

## Testing Checklist Before Going Live

### Local Testing
- [ ] Score Day 1 fully
- [ ] Finish Round
- [ ] Go to Day 2
- [ ] Results tab shows Day 1 scores
- [ ] Board shows Day 1 in Overall
- [ ] Close browser & reopen → scores still there

### Vercel Testing (with Firebase)
- [ ] Deploy to Vercel with `NEXT_PUBLIC_USE_FIREBASE_PRIMARY=true`
- [ ] Create test event on Vercel
- [ ] Score players
- [ ] Finish round
- [ ] Check Firestore console for saved scores
- [ ] Go to Day 2
- [ ] Scores visible in Results & Board

### Edge Cases
- [ ] Browser offline → scores still save to localStorage
- [ ] Browser online → scores sync to Firebase
- [ ] Clear browser storage → Firebase provides recovery
- [ ] Multiple devices → Firebase keeps them in sync

---

## Storage Strategy Comparison

| Feature | localStorage | Firebase |
|---------|-------------|----------|
| Setup Required | ❌ None | ✅ Rules + Env vars |
| Works Offline | ✅ Yes | ❌ No (but cached) |
| Multi-Device Sync | ❌ No | ✅ Yes |
| Cloud Backup | ❌ No | ✅ Yes |
| Speed | ✅ Instant | ⚠️ Network dependent |
| Data Persistence | ⚠️ Browser-dependent | ✅ Permanent |

---

## Troubleshooting

### Scores not showing on Day 2
1. Check browser localStorage: DevTools → Application → LocalStorage
2. Look for keys starting with `golf-scores-`
3. If empty → scores weren't saved during Day 1
4. If present → state management issue (check console errors)

### Firebase writes failing
1. Check Firebase Console → Firestore → Rules
2. Verify security rules are correct
3. Check Vercel logs for error details
4. Temporarily switch to `NEXT_PUBLIC_USE_FIREBASE_PRIMARY=false`

### Scores disappearing
1. **Local:** Check if localStorage is being cleared on page unload
2. **Production:** Check Firestore quota limits
3. **Both:** Check browser console for JavaScript errors

---

## Configuration File Reference

Located at: `app/config.ts`

```typescript
// Switch storage strategy
NEXT_PUBLIC_USE_FIREBASE_PRIMARY=true  // Firebase-first
NEXT_PUBLIC_USE_FIREBASE_PRIMARY=false // localStorage-first (default)
```

Change via Vercel Environment Variables.

---

## Current Status Summary

```
✅ Local Development:  localStorage working perfectly
⏳ Production Ready:   Needs Firebase rules + Vercel env vars
📋 Deployment Steps:  See "Phase 2" above
🚀 Timeline:          Ready to deploy anytime
```

---

## Next Steps

1. **For testing:** Keep using localhost with localStorage ✅
2. **For production:** Follow Phase 2 & 3 when ready to deploy
3. **Optional enhancement:** Phase 4 to enable Firebase-first mode

Questions? Check console logs in DevTools for detailed storage operations.
