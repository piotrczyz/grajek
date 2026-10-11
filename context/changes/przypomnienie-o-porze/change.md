---
change_id: przypomnienie-o-porze
title: One gentle daily reminder at the practice time
status: implementing
created: 2026-10-11
updated: 2026-10-11
archived_at: null
---

## Notes

Zrealizuj slice S-08 „Przypomnienie o porze” (change-id: przypomnienie-o-porze) z roadmapy context/foundation/roadmap.md.

Roadmap slice S-08; PRD refs FR-004, NFR Powiadomienia, ADR 0001.

Areas:
A1 Przypomnienie o porze — sync of practice time + "practiced today" flag to the server (with offline retry), server-side scheduled reminder (Web Push), and the client setting to turn it off / limit to plan days; builds on —

Context from the requester: Stack of unmerged branches F-01 → S-01 → S-07 → S-02 → F-02 → S-04 → S-06 (this worktree has all of them). F-02 gave anonymous device registration (Web Push/VAPID, Cloud Functions + Firestore europe-central2, endpoints PUT/DELETE /api/devices/{id}, POST /api/devices/{id}/test, IndexedDB store `device` v5, „Powiadomienia” panel). S-07 gave Pora ćwiczeń (store `practiceTime` v3, different times on chosen days). S-02 gave practice records (store `practices` v4). ADR 0001: only an anonymous id, the reminder time and whether a record existed that day may leave the device.
Scope FR-004: at most one gentle notification per day about the student's Pora ćwiczeń, only on a plan day and only when no record that day; encouraging tone only; easy to turn off or limit to plan days. Sync time and the "today practiced" flag with the server (offline-safe: send when the network returns); server-side schedule (e.g. scheduled function every few minutes, device timezone). Tests on the Firestore/Functions emulator (CI has a functions job with JDK 21; locally there is no Java — emulator tests cannot run locally, record that). No deploy, no cloud changes.
Coordination: S-03 (weekly goal, may add a migration) and S-09 (multiple instruments) run in parallel. Do NOT add an IndexedDB migration unless unavoidable (e.g. store reminder settings in an existing store such as `device` or `practiceTime` records); if one is unavoidable, say so explicitly in the plan and in your result (the version number will be assigned at merge).
Keep parallel-safety in mind: minimise edits to shared files (db schema module, routing).
