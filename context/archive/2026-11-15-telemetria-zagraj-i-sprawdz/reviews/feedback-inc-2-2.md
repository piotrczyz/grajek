# Client feedback 2 (increment 2)

### piotr@rocksoft.pl — 2026-11-15 — PR #23

Poprawka CI w otwartym PR #23. Commituj na tym samym branchu i pushuj. Bez nowego PR.

Job `check` w GitHub Actions (ubuntu) pada na nowym teście e2e, lokalnie na Windows przechodził:
```
[mobile-chromium] › e2e/spike-nuty-narrow.spec.ts:15:1 › the note-by-note list is readable at 360 px
Error: expect(received).toBeLessThanOrEqual(expected)  Expected: <= 324  Received: 331
> 68 |   expect(worstCase.tableWidth).toBeLessThanOrEqual(worstCase.sectionWidth);
```
(także na retry #1). Na Linuksie fonty są szersze, więc tabela "Nuta po nucie" nadal wychodzi poza sekcję na 360 px. Napraw UKŁAD (nie poluzowuj testu): tabela/lista ma mieścić się w szerokości sekcji niezależnie od fontu (np. `table-layout: fixed` + `w-full` + zawijanie/`break-words`, mniejsze paddingi, węższe kolumny liczbowe albo układ kart zamiast tabeli na wąskim ekranie). Upewnij się, że rozwiązanie ma zapas dla szerszych fontów (sprawdź też z wymuszonym szerszym fontem fallback, np. przez zmianę font-family w teście lokalnie albo większy font-size), a test pozostaje sensowny.

Uruchom pełne testy (unit, e2e, lint, typecheck, build), wypchnij i sprawdź przez GitHub API, że check-runs na nowym head sha #23 są zielone (poczekaj na zakończenie CI). Jeśli wciąż czerwone – napraw i powtórz.
