---
change_id: karta-postepu
title: Shareable Progress Card image generated on the device
status: impl_reviewed
created: 2026-10-11
updated: 2026-10-11
archived_at: null
---

## Notes

Zrealizuj slice S-06 „Karta postępu” (change-id: karta-postepu) z roadmapy context/foundation/roadmap.md. Zakres: FR-008 — przycisk generuje obrazek Karty postępu (generowany na urządzeniu, offline) i otwiera systemowe udostępnianie (fallback: pobranie obrazka, gdy udostępnianie plików niedostępne). Karta pokazuje własny wysiłek (np. „4 dni z muzyką w tym tygodniu”, instrument), bez danych osobowych (imię/pseudonim nie na karcie — rozstrzygnij wg challenge'u FR-001) i bez liczb zachęcających do licytowania się. Czytelna dla dzieci, polski.

Coordination constraints from the requester:
- F-02, S-03, S-04 are being built in parallel on other branches. This change must NOT add an IndexedDB schema migration / version bump; read existing stores only.
- Keep App.tsx edits minimal (ideally none, or a single line); prefer placing the button inside an existing screen component.
- No new runtime dependency unless clearly necessary (prefer Canvas 2D API for rendering).
- Prerequisites F-01, S-01, S-07, S-02 are unmerged and stacked under this branch (base commit e4e6ed3).
