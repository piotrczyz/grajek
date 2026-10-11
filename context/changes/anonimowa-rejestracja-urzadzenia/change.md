---
change_id: anonimowa-rejestracja-urzadzenia
title: Anonymous device registration for notifications
status: impl_reviewed
created: 2026-10-11
updated: 2026-10-11
archived_at: null
---

## Notes

Zrealizuj slice F-02 „Anonimowa rejestracja urządzenia do powiadomień” z roadmapy context/foundation/roadmap.md (sekcja "### F-02"). Change-id: anonimowa-rejestracja-urzadzenia (the roadmap slice's Change ID).

Areas:
A1 anonimowa-rejestracja-urzadzenia — the whole slice: minimal contract for anonymous device registration for notifications (client side in the PWA plus a Firebase backend endpoint/storage) and a way to verify delivery; builds on nothing new beyond F-01.

Context and constraints from the requester:
- This branch starts from F-01 (szkielet-aplikacji-offline, commit f20ecf5), which is NOT yet merged to main; merge order is F-01 before F-02. Do not modify or archive anything of the szkielet-aplikacji-offline change; keep strictly to F-02 scope. Another run is doing S-01 (profile and instrument) in parallel; do not touch that scope.
- ADR 0001 (context/discovery/decisions/0001-...): off the device only an anonymous device identifier, the reminder time and whether a practice entry exists for a given day; no identifying data at all. F-02 stores only what registration needs (anonymous id + push token/subscription and timestamps); reminder-time and per-day flags belong to S-07/S-08 unless the minimal contract needs a placeholder field — decide and record.
- Deploy target: Firebase project `grajek-app` (exists; Hosting configured in F-01 via firebase.json/.firebaserc). tech-stack.md asks to consider the Firebase ecosystem (FCM, Cloud Functions, Firestore) instead of PostgreSQL for F-02 — prefer Firebase and UPDATE context/foundation/tech-stack.md with that decision (edit in place, bump updated:).
- Cloud Functions need the Blaze plan, billing is not linked yet. Everything must build and be tested locally with the Firebase Emulator Suite (functions + firestore emulators). NO deploy, NO cloud changes. Billing hookup and deploy are a manual step for the user: put them as Manual criteria and in the plan's notes.
- Scope: minimal anonymous registration contract plus verification of delivery (e.g. a test-send path verifiable on emulator/unit level, with real-device delivery on Android/iOS as a Manual criterion). Not the full reminders feature (that is S-08). iOS web-push limits (installed PWA only) are a known risk; record it.
- RODO/parental consent unknown is owned by the user and blocks publication, not the build: record it as a soft guard / manual item.
- Prefer a single increment unless the budget truly needs more; if you cut more, every increment must be independently shippable.
