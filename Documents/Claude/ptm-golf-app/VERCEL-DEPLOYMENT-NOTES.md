# ⚠️ CRITICAL: Vercel Deployment Constraints

**IMPORTANT:** This file documents critical limitations that MUST be followed for successful Vercel deployment.

---

## The Problem: Third-Party SDKs on Vercel

**THIRD-PARTY SDKs DO NOT WORK ON VERCEL** due to ESM/CommonJS incompatibility.

This includes:
- Firebase Admin SDK
- Resend SDK
- Any other server-side SDK that requires native modules

❌ **DO NOT use:**
```typescript
import { adminDb } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { Resend } from 'resend';
```

**These files WILL CAUSE 404 ERRORS on Vercel (if they import SDKs):**
- `app/api/claim-key/route.ts` (has Firebase Admin SDK)
- `app/api/create-free-key/route.ts` (has Firebase Admin SDK)
- `app/api/generate-super-key/route.ts` (has Firebase Admin SDK)
- `app/api/owner/health/route.ts` (has Firebase Admin SDK)
- `app/api/stripe-webhook/route.ts` (has Firebase Admin SDK)
- `app/api/validate-key/route.ts` (has Firebase Admin SDK)
- `app/api/send-event-email/route.ts` (DO NOT use Resend SDK - use REST API)

---

## The Solution: Use REST APIs Only (No SDKs)

✅ **ALWAYS use REST API instead of SDKs:**

**Example 1: Firestore REST API**
```typescript
// ✅ CORRECT - Uses REST API
const response = await fetch(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/events/${eventId}`,
  {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  }
);
```

**Example 2: Resend REST API**
```typescript
// ✅ CORRECT - Uses REST API, NOT Resend SDK
const emailResponse = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'noreply@example.com',
    to: userEmail,
    subject: 'Subject',
    html: '<p>Email content</p>',
  }),
});
```

**Files that correctly use REST API:**
- ✅ `app/api/delete-event/route.ts` (REST API)
- ✅ `app/api/owner/events/route.ts` (REST API)
- ✅ `app/api/owner/check-round-scoring/route.ts` (REST API)
- ✅ `app/api/owner/progress-event/route.ts` (REST API)

---

## Deployment Checklist

**BEFORE every deployment, verify:**

1. **No Firebase Admin SDK Imports in API Routes**
   ```bash
   # This should return NO results:
   grep -r "firebase-admin\|Admin SDK" app/api/ --include="*.ts" --include="*.js"
   ```
   
   If it returns results, DO NOT DEPLOY. Instead:
   - Rewrite the route to use REST API
   - OR remove the file if not needed for Vercel
   - Then commit and push

2. **Only REST API in Server-Side Code**
   - Every `app/api/**/*.ts` file must use `fetch()` with Firestore REST API
   - No imports from `firebase-admin` package
   - No Admin SDK initialization

3. **Cache-Control Headers on Dynamic Endpoints**
   - Always add cache-control headers to prevent Vercel edge caching
   - Example:
   ```typescript
   return Response.json({ data }, {
     headers: {
       'Cache-Control': 'no-store, no-cache, must-revalidate',
       'Pragma': 'no-cache',
     },
   });
   ```

---

## Safe Deployment Process

```bash
# Step 1: Check for Admin SDK usage
grep -r "firebase-admin" app/api/ --include="*.ts"
# Result should be: NO OUTPUT

# Step 2: Commit changes
git add [files]
git commit -m "[message]"

# Step 3: Push to main (triggers Vercel auto-deploy)
git push origin main

# Step 4: Verify deployment
# Check Vercel dashboard for successful build
# Test on https://ptm-golf.vercel.app
```

---

## If Deployment Fails with 404

**Immediate action:**
1. Check Vercel build logs for "firebase-admin" errors
2. If found, roll back: `git revert [commit]` then `git push`
3. Rewrite affected API route using REST API
4. Redeploy

**Root cause is always one of:**
- Firebase Admin SDK import in `app/api/`
- Missing environment variables
- Syntax error in API route

---

## Environment Variables Required

These MUST be set in Vercel dashboard:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ptm-golf-xxxxx
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ptm-golf-xxxxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://ptm-golf-xxxxx.firebaseio.com
```

**NOTE:** No Firebase Admin SDK credentials needed (REST API uses ID tokens)

---

## Files to NEVER Deploy to Vercel

Even if they exist in the repo, these will fail:
- `lib/firebase-admin.ts` (can exist for local dev only)
- Any file importing `firebase-admin/app` or `firebase-admin/firestore`

If these are needed locally for testing, keep them but:
- Don't import in any `app/api/` routes
- Don't push API routes that use them
- Use conditional imports if necessary

---

## Quick Reference: REST API vs Admin SDK

| Task | Admin SDK ❌ | REST API ✅ |
|------|------------|-----------|
| Read document | `adminDb.collection()...get()` | `fetch(...GET)` |
| Write document | `adminDb.collection()...set()` | `fetch(...PATCH)` |
| Delete document | `adminDb.collection()...delete()` | `fetch(...DELETE)` |
| Query docs | `adminDb.collection().where()...` | `fetch(...?pageSize=1000)` |
| Works on Vercel | ❌ NO | ✅ YES |

---

## Summary

**GOLDEN RULE:** If your API route imports anything from `firebase-admin`, it will NOT work on Vercel.

Always verify with:
```bash
grep -r "firebase-admin" app/api/
```

If output is empty → **SAFE TO DEPLOY** ✅

---

**Last Updated:** 2026-07-02  
**Severity:** CRITICAL - Deployment will fail if this is ignored
