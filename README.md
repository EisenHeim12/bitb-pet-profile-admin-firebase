# BitB Pet Profile Admin (Firebase)

This is a **salon-only internal dashboard** for complete pet profile management:
- Clients (pet parents)
- Pets (profile + microchip)
- Vet visits (diagnosis/prognosis + follow-up reminders)
- Medications (schedule + in-app reminders for next 14 days)
- Vaccinations (due reminders)
- Deworming + spot-on (due reminders)
- Grooming records (next grooming reminders)
- Training sessions (next session reminders)
- Activity log
- Meal plan (simple text schedule + preferences)
- Documents vault (uploads to Firebase Storage)

## Why this is built this way
You asked for a “full blown app” upfront. That approach is usually **trash** because it creates a messy, fragile codebase.
So this prototype focuses on a clean structure and a usable UI/UX, with every module in place as CRUD.

## 0) Install tools (once)
- Node.js LTS (v20+ recommended)
- VS Code
- Git (optional but strongly recommended)

## 1) Create Firebase project
1. Go to Firebase Console
2. Create a project
3. Enable:
   - Firestore (production mode is fine; rules included)
   - Authentication → Email/Password
   - Storage

## 2) Create your admin login
- Firebase Console → Authentication → Users → Add user
- Use your email + password

## 3) Apply Firestore rules
From this project folder:
```bash
npm i -g firebase-tools
firebase login
firebase init firestore
# when asked, point rules file to firestore.rules and indexes to firestore.indexes.json
firebase deploy --only firestore
```

### Critical: Admin allowlist
In Firestore, create document:
- Collection: config
- Document ID: admins
- Field: emails (array)
- Value: ["youradminemail@example.com"]

Without this, you will be denied.

## 4) Configure env vars
1. Firebase Console → Project settings → Your apps → Web app
2. Copy config values into `.env.local` (use `.env.local.example`)

## 5) Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000/login

## 6) Deploy (recommended approach)
**Use Firebase App Hosting** for Next.js full-stack deployments:
- Firebase docs recommend App Hosting for full-stack Next.js apps.
- App Hosting builds + runs your Next app on Cloud Run.

Deploying workflow:
1. Push this repo to GitHub
2. Firebase Console → App Hosting → Create backend → Connect repo
3. Add env vars (Firebase web config) as secrets/env in App Hosting settings
4. Deploy

## Notes / limitations (by design)
- Reminders are **in-app** (dashboard + reminders page). WhatsApp/SMS is a separate integration.
- Vet booking integrations are not “a feature”, they are a partner/integration problem.
- This is admin-only. Do NOT relax rules.

