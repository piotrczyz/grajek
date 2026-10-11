---
change_id: kilka-instrumentow
title: Several instruments with per-instrument and combined stats
status: planned
created: 2026-10-11
updated: 2026-10-11
archived_at: null
---

## Notes

Zrealizuj slice S-09 „Kilka instrumentów” (change-id: kilka-instrumentow) z roadmapy context/foundation/roadmap.md. Zakres: FR-009 — dodanie kolejnych instrumentów w profilu, wybór instrumentu przy zapisie (domyślnie ostatnio używany, bez dodatkowego dotknięcia gdy jest jeden), statystyki osobno i razem; Dzień z muzyką i Cel tygodniowy liczą się niezależnie od instrumentu (wspólny cel). Zapis nadal ok. 10 s. Kontekst: S-01 utworzył store IndexedDB `instruments` (key id, jeden wiersz, przygotowany pod S-09). S-02 zapisuje ćwiczenia w `practices` (v4). S-04 ma widok miesiąca i łączny dorobek, S-06 Kartę postępu z instrumentem. Koordynacja: równolegle pracują S-03 (cel tygodniowy) i S-08 (przypomnienia) na osobnych gałęziach. Nie dodawaj migracji IndexedDB (bump wersji DB), jeśli nie musisz — store instruments już istnieje; jeśli musisz, zapisz to jako Key decision i soft guard. Zmiany w App.tsx / ProfileScreen minimalne (konflikty merge z S-03/S-08). Bez deployu.

Areas:
A1 kilka-instrumentow — whole slice: instrument list in profile, instrument choice on practice log, per-instrument and combined stats (one area: the parts form one dependent chain and the base stack is unmerged, so dependent increments could not run in this run).
