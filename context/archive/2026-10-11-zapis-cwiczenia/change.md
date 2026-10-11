---
change_id: zapis-cwiczenia
title: Log a practice session in about 10 seconds with the current-week view
status: archived
created: 2026-10-11
updated: 2026-10-11
archived_at: 2026-10-11T16:13:55Z
---

## Notes

Zrealizuj slice S-02 „Zapis Ćwiczenia z widokiem tygodnia” (north star) z roadmapy context/foundation/roadmap.md. Zakres: FR-005 (zapis w ok. 10 s, max 3 dotknięcia, offline; czas + opcjonalnie „nad czym pracowałem” i emoji, domyślnie zwinięte), FR-006 tylko widok bieżącego tygodnia (Dni z muzyką wyróżnione, puste neutralne), US-01 bez celu tygodniowego (to S-03).

Areas (orchestrator):
A1 zapis-cwiczenia — practice-session record (store + schema migration), the ~10 s / max-3-tap offline logging flow, and the current-week view built on it; builds on nothing new (uses S-01 profile/instrument)

Constraints from the orchestrator:
- Exactly one increment preferred (the area is one shippable feature).
- Schema: APPEND a new migration (v3) to the end of src/storage/migrations.ts; never edit existing entries. Parallel slices F-02 and S-07 may also append a migration — note the version-number conflict risk in the plan.
- Carry-over from S-01 review finding F2: openDb does not close the connection on versionchange (no onversionchange/blocked handling). Since this change adds v3, the plan must handle it (close on versionchange so an open tab does not block the upgrade).
- Week view: current week only; days with music highlighted, empty days neutral; no weekly goal, no month view.
