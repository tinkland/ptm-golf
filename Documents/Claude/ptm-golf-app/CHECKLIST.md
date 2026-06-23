# PTM Golf App - Setup Checklist

**Use this to verify everything is working!**

---

## ✅ Firebase Setup Checklist

### Firebase Project Created
- [ ] Went to https://console.firebase.google.com
- [ ] Created project named "ptm-golf"
- [ ] Project shows in Firebase Console

### Firestore Database
- [ ] Clicked "Firestore Database" in left sidebar
- [ ] Clicked "Create Database"
- [ ] Selected "Production mode"
- [ ] Selected region "us-central1"
- [ ] Database created successfully
- [ ] Can see "Firestore Database" page with "Start collection" button

### Authentication
- [ ] Clicked "Authentication" in left sidebar
- [ ] Clicked "Get Started"
- [ ] Enabled "Email/Password" (shows ✅ Enabled)
- [ ] Enabled "Anonymous" (shows ✅ Enabled)

### Firebase Credentials
- [ ] Found Project Settings (gear icon → Project Settings)
- [ ] Found "Your apps" section with web app config
- [ ] Copied Firebase config (6 values):
  - [ ] apiKey
  - [ ] authDomain
  - [ ] projectId
  - [ ] storageBucket
  - [ ] messagingSenderId
  - [ ] appId

### Firestore Rules Published
- [ ] In Firestore Database page, clicked "Rules" tab
- [ ] Pasted new rules (from SIMPLE-SETUP.md)
- [ ] Clicked "Publish"
- [ ] See "Rules published successfully" message

---

## ✅ Local Setup Checklist

### Project Files
- [ ] Folder exists: `C:\Users\andre\Documents\Claude\ptm-golf-app\`
- [ ] Files in folder:
  - [ ] `package.json`
  - [ ] `tsconfig.json`
  - [ ] `next.config.js`
  - [ ] `tailwind.config.js`
  - [ ] `postcss.config.js`
  - [ ] `.gitignore`
  - [ ] `.env.example`
  - [ ] `README.md`
  - [ ] `SIMPLE-SETUP.md`
  - [ ] `CHECKLIST.md` (this file)

### App Folder
- [ ] Folder exists: `app/`
- [ ] Files in `app/`:
  - [ ] `page.tsx`
  - [ ] `layout.tsx`
  - [ ] `globals.css`
  - [ ] `auth-ui.tsx`
  - [ ] `auth-provider.tsx`
  - [ ] `golf-app.tsx`

### Lib Folder
- [ ] Folder exists: `lib/`
- [ ] File in `lib/`:
  - [ ] `firebase.ts`

### .env.local File
- [ ] Created `.env.local` in project root
- [ ] File name is **exactly** `.env.local` (not `.env.local.txt`)
- [ ] Contains all 6 Firebase variables:
  - [ ] NEXT_PUBLIC_FIREBASE_API_KEY=...
  - [ ] NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
  - [ ] NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
  - [ ] NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
  - [ ] NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
  - [ ] NEXT_PUBLIC_FIREBASE_APP_ID=...
- [ ] All values are filled (not empty)
- [ ] No extra quotes or spaces

---

## ✅ Installation Checklist

### NPM Install
- [ ] Opened terminal in `ptm-golf-app` folder
- [ ] Ran: `npm install`
- [ ] Saw: "added X packages" message
- [ ] No error messages (warnings are OK)

### Dev Server
- [ ] Ran: `npm run dev`
- [ ] See message: `Local: http://localhost:3000`
- [ ] Terminal is still running (not stopped)

---

## ✅ Testing Checklist

### Website Loads
- [ ] Opened http://localhost:3000 in browser
- [ ] See PTM Golf logo and "Sign In" screen
- [ ] Sign Up button visible
- [ ] No blank white page or errors

### Sign Up Works
- [ ] Clicked "Sign Up"
- [ ] Entered email: `test@example.com`
- [ ] Entered password: `password123`
- [ ] Clicked "Create Account"
- [ ] Logged in successfully (no error)
- [ ] See "Create Event" page

### Create Event Works
- [ ] Entered event name: "Test Event"
- [ ] Entered player 1: "Player One"
- [ ] Clicked "Add"
- [ ] See player added to list
- [ ] Entered player 2: "Player Two"
- [ ] Clicked "Add"
- [ ] See both players
- [ ] Clicked "Start Game"
- [ ] See scoring screen

### Firebase Rules Published
- [ ] All steps above worked without permission errors
- [ ] No "Permission denied" messages
- [ ] No "Unauthorized" errors

---

## 🎉 All Done?

If all checkboxes are checked:
✅ **Your app is working!**

Next steps:
1. Try signing out and signing back in
2. Create a few test events
3. Add it to your home screen (mobile)
4. Deploy to Vercel (see SIMPLE-SETUP.md Part 5)

---

## ❌ Something's Not Working?

Go back through the checklist:
1. Find the first unchecked item
2. Follow that step again slowly
3. Verify it matches "what you should see"

Common issues:
- **Can't find Firestore Database?** Scroll down in left sidebar
- **Rules won't publish?** Delete old rules first, paste new ones completely
- **npm install fails?** Run `npm cache clean --force` then try again
- **Website won't load?** Check if you're at http://localhost:3000 (not localhost:3001)
- **Can't sign up?** Make sure Email/Password is enabled in Authentication

Still stuck? Check SIMPLE-SETUP.md → "If Something Goes Wrong"

---

**Status:** Ready when all checkboxes are done ✅
