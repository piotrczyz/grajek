---
change_id: ci-deploy-firebase
title: Deploy to Firebase Hosting from GitHub Actions (PR previews and live on main)
status: planned
created: 2026-10-11
updated: 2026-10-11
archived_at: null
---

## Notes

Dodaj automatyczne publikowanie na Firebase Hosting z GitHub Actions: podgląd (preview channel) dla każdego PR z linkiem w komentarzu oraz deploy na live (https://grajek-app.web.app) po merge'u do main.

Additional constraints from the requester: pnpm, Node >=22.12 (.nvmrc), Vite build -> dist/. Use the official action FirebaseExtended/action-hosting-deploy with repo secret FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP (does not exist yet; the user will create it — README must describe exactly how: `firebase init hosting:github` or manually a service account with role Firebase Hosting Admin + `gh secret set FIREBASE_SERVICE_ACCOUNT_GRAJEK_APP`). Live deploy only from main; preview only for PRs from the same repo (not forks). The workflow must first pass lint/typecheck/test/build (existing .github/workflows/ci.yml has these steps; firebase.json and .firebaserc -> project grajek-app already exist). No deploy from a local machine (no deploy script in package.json). Permissions should be minimal (preview needs pull-requests: write, checks: write per the action docs).

Areas (from rs-orchestrator):
A1 CI/CD deploy pipeline — GitHub Actions workflow(s) deploying to Firebase Hosting (PR preview channel with comment, live on push to main) gated on the existing checks, plus README setup docs; builds on nothing.
