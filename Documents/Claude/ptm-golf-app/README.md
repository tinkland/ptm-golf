# PTM Golf Scoring App - Simple Setup

**Everything you need is in this folder!**

## Quick Start (3 steps)

### 1. Setup Firebase (10 min)
- Follow **SIMPLE-SETUP.md** → Part 1
- Get your Firebase credentials
- Create `.env.local` file in this folder with those credentials

### 2. Install & Run (2 min)
```bash
npm install
npm run dev
```

Open: **http://localhost:3000**

You should see the login screen!

### 3. Test It
1. Sign up with any email
2. Create an event
3. Add players
4. Click "Start Game"

**That's it!**

---

## Files in This Folder

```
ptm-golf-app/
├── SIMPLE-SETUP.md          ← READ THIS FIRST
├── app/
│   ├── page.tsx             ← Main app page
│   ├── layout.tsx           ← App layout
│   ├── globals.css          ← Styles
│   ├── auth-ui.tsx          ← Sign in screen
│   ├── auth-provider.tsx    ← Authentication
│   └── golf-app.tsx         ← Scoring app
├── lib/
│   └── firebase.ts          ← Firebase config
├── package.json             ← Dependencies
├── tsconfig.json            ← TypeScript config
├── .env.example             ← Template for .env.local
└── [other config files]
```

---

## What to Do

### First Time?
1. Read **SIMPLE-SETUP.md** (Part 1: Firebase)
2. Follow **SIMPLE-SETUP.md** (Part 2: .env.local file)
3. Run: `npm install`
4. Run: `npm run dev`
5. Go to: http://localhost:3000

### Want to Deploy?
Follow **SIMPLE-SETUP.md** (Part 5: Vercel)

### Something Wrong?
Check **SIMPLE-SETUP.md** → "If Something Goes Wrong"

---

## The Easiest Way to Get Started

**All the code files are already here!**

You just need to:
1. Create `.env.local` with Firebase credentials
2. Run `npm install`
3. Run `npm run dev`

That's genuinely it! No downloading, no copying files around.

---

## Support

If something doesn't match the Firebase console you're seeing:
- Look for the section name (like "Firestore Database", "Authentication")
- Click on it if you don't see what you're looking for
- The layout might be slightly different, but the features are the same

---

**Ready to go!** Start with SIMPLE-SETUP.md 🏌️
