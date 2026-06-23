# PTM Golf App - Super Simple Setup (Really!)

**This is the simplest possible guide. We'll go slow.**

---

## Part 1: Get Your Firebase Keys (10 minutes)

### Step 1a: Open Firebase
1. Go to: **https://console.firebase.google.com**
2. You should see a page with "Welcome to Firebase" or a list of projects

### Step 1b: Create a New Project
**If you see "Create a project" button:**
- Click it
- Enter name: `ptm-golf`
- Click "Create project"
- Wait ~2 minutes for it to set up
- Click "Continue" when done

**If you see "Add project":**
- Click "Add project"
- Enter name: `ptm-golf`
- Uncheck "Enable Google Analytics"
- Click "Create"
- Wait ~2 minutes
- Click "Continue"

**If you see a list of projects already:**
- Click the "+" or "Create" button
- Do the same as above

### Step 1c: Enable Firestore
You're now in your project. Look at the **left sidebar**:

**Find "Build" section** (or scroll down if you don't see it)
- Click "Firestore Database"
- Click "Create Database" button (big blue button)
- You'll see options pop up

**In the popup:**
- Choose: **"Production mode"** (click the radio button)
- Click "Next"
- Choose region: **"us-central1"** (or the one that says "(closest to you)")
- Click "Create"
- Wait 1-2 minutes for setup

**You should see:** A page that says "Firestore Database" with some empty collections

### Step 1d: Enable Authentication
Still in the **left sidebar**, under "Build":
- Click "Authentication"
- You'll see "Get Started" or a big button

**Click "Get Started"** (or whichever button you see)

You'll see "Sign-in methods":
- Look for "Email/Password" 
- Click on it
- Toggle "Enable" (turn it on - should turn blue)
- Click "Save"

That's it! You should see "Email/Password" now shows as "Enabled"

### Step 1e: Get Your Firebase Keys
**Still in left sidebar, click the gear icon (⚙️) at the top**

You'll see "Project Settings" - click it

Look for a section called **"Your apps"** or **"SDK setup and configuration"**

If you don't see any apps listed:
- Look for a button like **"Add app"** or **`</>`** 
- Click it
- Choose "Web"
- Name it: `ptm-golf` (doesn't matter much)
- Click "Register app"

Now you should see your **Firebase config**. It looks like this:
```
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "ptm-golf.firebaseapp.com",
  projectId: "ptm-golf",
  storageBucket: "ptm-golf.appspot.com",
  messagingSenderId: "...",
  appId: "1:...:web:..."
};
```

**Copy the whole thing** (everything between the `{` and `}`)

---

## Part 2: Download the App Code

### Step 2a: Get the Code Files
1. I've prepared all the files for you in: `C:\Users\andre\Documents\Claude\ptm-golf-app\`
2. The files are ready to use

### Step 2b: Create Your Settings File
1. Open Notepad (Windows search for "Notepad")
2. Paste this, **but replace the values** with what you copied from Firebase:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...PASTE_YOUR_API_KEY_HERE...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=1:your-app-id:web:your-id
```

3. Replace each `...PASTE_YOUR...` with the actual values from Firebase
4. Save this file as `.env.local` in the `ptm-golf-app` folder
   - Click File → Save As
   - Filename: `.env.local` (type exactly that)
   - Save location: `C:\Users\andre\Documents\Claude\ptm-golf-app\`

**Example of what it should look like (filled in):**
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDvJ9xL5qWjK2pM4oRfT6uV7wXyZ8a9b0c
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ptm-golf.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ptm-golf
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=ptm-golf.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
```

---

## Part 3: Firestore Rules (Important!)

### Step 3a: Back in Firebase Console
1. Go back to Firebase Console
2. Click on "Firestore Database" (left sidebar)
3. Click "Rules" tab (top of the page)

### Step 3b: Replace the Rules
1. Delete everything in the rules editor (Ctrl+A, then Delete)
2. Paste this:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /events/{eventId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if resource.data.ownerId == request.auth.uid;
    }
    match /scores/{scoreId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /gameResults/{resultId} {
      allow read: if true;
      allow create: if request.auth != null;
    }
  }
}
```

3. Click **"Publish"** button
4. Wait for "Rules published" message

---

## Part 4: Install the App

### Step 4a: Open Terminal
1. Right-click on `C:\Users\andre\Documents\Claude\ptm-golf-app` folder
2. Click "Open in Terminal" (or "Open PowerShell window here")

### Step 4b: Install
Type this command and press Enter:
```
npm install
```

Wait for it to finish (will take 2-3 minutes). You should see "added X packages"

### Step 4c: Test Locally
Type this command and press Enter:
```
npm run dev
```

You should see:
```
> Local: http://localhost:3000
```

Open your browser and go to: **http://localhost:3000**

**You should see:**
- PTM Golf logo
- Sign Up / Sign In screen

### Step 4d: Test It Works
1. Click "Sign Up"
2. Enter: **test@example.com** and **password123**
3. Click "Create Account"
4. You should be logged in to the app!

**If you see this, everything works!** ✅

---

## Part 5: Deploy to Vercel (Optional)

### Step 5a: Create GitHub Account
1. Go to **https://github.com**
2. Click "Sign up"
3. Fill in your details
4. Verify your email

### Step 5b: Create a Repository
1. Go to **https://github.com/new**
2. Repository name: **ptm-golf**
3. Choose "Public"
4. Click "Create repository"

### Step 5c: Upload Your Code
In your terminal (in the ptm-golf-app folder), type these commands one by one:

```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ptm-golf.git
git push -u origin main
```

*Replace `YOUR_USERNAME` with your actual GitHub username*

### Step 5d: Deploy to Vercel
1. Go to **https://vercel.com**
2. Click "Sign up" (use your GitHub account)
3. Click "Add New" → "Project"
4. Select your `ptm-golf` repository
5. Click "Import"

**Important:** Before clicking Deploy:
- Look for "Environment Variables" section
- Click "Add New" for each variable
- Add all 6 Firebase variables from Step 2b
- Then click "Deploy"

Wait 2-3 minutes. When done, you'll see your live URL!

**Your app is now live!** 🎉

---

## If Something Goes Wrong

### "I don't see Firestore Database option"
- Scroll down in the left sidebar
- It might be under "Build" section
- Or look for "Develop"

### "Firestore won't create"
- Close browser tab, go back to Firebase
- Refresh the page
- Try again

### ".env.local file not working"
- Make sure filename is exactly `.env.local` (not `.env.local.txt`)
- Must be in the `ptm-golf-app` folder
- Restart terminal after creating it

### "npm install fails"
Try this:
```
npm cache clean --force
npm install
```

### "Localhost doesn't work"
- Make sure you did `npm run dev` (in terminal)
- Go to: http://localhost:3000 (exactly as written)
- Check terminal is still running (hasn't stopped)

### "Can't sign up"
- Make sure Email/Password is enabled in Firebase Authentication
- Refresh the page
- Try again

---

## That's It!

You now have:
✅ A working golf scoring app
✅ Running locally (or deployed to Vercel)
✅ With cloud storage
✅ Real-time updates
✅ Ready to use!

### Next Steps:
1. **Test**: Sign in, create an event, add a player, enter a score
2. **Share**: Copy the Vercel URL, send to friends
3. **Use**: On the golf course!

---

**Questions?** Check the "If Something Goes Wrong" section above.

**Ready to go!** ⛳🏌️
