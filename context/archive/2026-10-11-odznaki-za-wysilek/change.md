---
change_id: odznaki-za-wysilek
title: Unannounced effort badges and the earned-badges collection
status: archived
created: 2026-10-11
updated: 2026-10-11
archived_at: 2026-10-11T17:01:04Z
---

## Notes

Zrealizuj slice S-05 „Odznaki za wysiłek” (change-id: odznaki-za-wysilek) z roadmapy context/foundation/roadmap.md.
Stan danych: IndexedDB v5 (v2 profile/instruments, v3 practiceTime, v4 practices z indeksem byDay, v5 device). Cel tygodniowy jest w store `profile` pod kluczem `weeklyGoal`. Jeśli potrzebny store na zdobyte Odznaki, dodaj migrację v6 na końcu (istniejących nie edytuj), użyj helpera z src/storage/connection.ts.
Zakres: FR-007, Business Logic, ADR 0002. Rozstrzygnij autonomicznie katalog Odznak i progi (Open Question 3): za wysiłek — łączny czas (np. pierwsza godzina, 5 h, 10 h…), liczba Dni z muzyką, zaliczone tygodnie celu, powrót po przerwie. Odznaki niezapowiedziane (żadnej listy do zdobycia ani postępu do następnej), przyznawane po zapisie ćwiczenia, nie do stracenia, kolekcja zdobytych widoczna. Komunikaty chwalą wysiłek, nie talent. Bez waluty, punktów, losowości. Odznaki przyznawane wstecznie dla istniejącej historii przy pierwszym uruchomieniu — rozstrzygnij, ale bez zalewu (np. jedna zbiorcza informacja).
Koordynacja: równolegle pracują S-08 (przypomnienia) i S-09 (kilka instrumentów) na starszej bazie (S-06). Zmiany w ProfileScreen/App.tsx minimalne (prefer a self-contained src/badges/ module with a single mount point); record the merge-conflict risk with S-08/S-09 as a soft guard/risk in the plan. Note S-09 may also add a migration v6 — record that numbering-collision risk too.

Areas:
A1 Odznaki za wysiłek — badge catalog and award rules, persistence of earned badges (v6 store), award after practice save incl. one-time retroactive award with a single summary message, and the earned-badges collection view; builds on —
