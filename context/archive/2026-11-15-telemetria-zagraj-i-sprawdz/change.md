---
change_id: telemetria-zagraj-i-sprawdz
title: Anonymous telemetry and accuracy feedback for the play-and-check screen
status: archived
created: 2026-11-15
updated: 2026-11-15
archived_at: 2026-11-15T19:38:28Z
---

## Notes

Request (no issue). Requested by: piotr@rocksoft.pl

Anonimowe logowanie wyników ekranu "Zagraj i sprawdź" (`?spike=nuty`, kod w `src/spike-nuty/`, właśnie zmergowany do main w PR #19 i #20), żeby właściciel mógł mierzyć dokładność rozpoznawania nut u wszystkich użytkowników, którzy z niego korzystają.

Kontekst: aplikacja ma już anonimowy identyfikator urządzenia (`src/push/device-id.ts`) i Cloud Function `api` (`functions/src`, Admin SDK), która jako jedyna pisze do Firestore (reguły Firestore blokują klientów). Użyj tego samego wzorca: nowy endpoint w `api`, klient wysyła dane przez fetch, zero bezpośredniego dostępu klienta do Firestore.

Cel produktowy: odróżnić błędy dziecka od błędów rozpoznawania. Sam wynik % tego nie mówi, więc potrzebujemy też informacji zwrotnej od grającego.

Zakres:
1. Po każdej zakończonej próbie wysyłaj jeden rekord (fire-and-forget, z kolejką offline w IndexedDB/localStorage i ponowną wysyłką, bez blokowania UI):
   - anonimowy deviceId, znacznik czasu, wersja aplikacji/build, user agent / model urządzenia, czy tryb standalone PWA;
   - utwór, instrument/transpozycja, tempo, czas przygotowania, ignoruj oktawę, tylko wizualny metronom, czy korekta opóźnienia włączona;
   - wynik %, wynik samych wysokości, liczby: dobrze / zły rytm / zła nuta / brakująca / dodatkowa;
   - lista nuta po nucie: oczekiwana, zagrana, centy, przesunięcie ms, status, flagi oktawa/duodecyma;
   - surowe wykryte zdarzenia (nuta, start, długość, średnia pewność/clarity, głośność), opóźnienie wyjścia audio, mediana i zastosowana korekta opóźnienia;
   - czy próba zakończona normalnie czy przerwana Stopem.
   NIE wysyłaj nagrania audio, imienia ani żadnych danych osobowych.
2. Informacja zwrotna o trafności na ekranie wyniku: pytanie "Czy ocena się zgadza?" z przyciskami "Tak" / "Nie". Przy "Nie" dziecko/rodzic może dotknąć nut, które aplikacja oceniła źle (przełącznik "aplikacja się pomyliła" na wierszu w liście nuta po nucie), i opcjonalnie krótki komentarz. Wysyłane jako aktualizacja tego samego rekordu (id próby generowane na kliencie).
3. Krótka informacja na ekranie spike'a po polsku: "Wysyłamy anonimowe dane o dokładności rozpoznawania (bez nagrania), żeby ulepszyć aplikację." Bez dodatkowej zgody (dane anonimowe, techniczne), ale z możliwością wyłączenia wysyłania przełącznikiem zapisywanym lokalnie.
4. Backend: endpointy w `api` z walidacją i limitami rozmiaru (np. max 200 zdarzeń, max rozmiar body), prosty rate limit per deviceId, zapis do kolekcji np. `spikeNutyAttempts`. Ustaw TTL (np. pole `expireAt` +180 dni) i opisz w README, jak włączyć politykę TTL w Firestore, jeśli nie da się tego zrobić z repo.
5. Odczyt dla właściciela: endpoint statystyk zabezpieczony sekretem (Firebase/Secret Manager, nagłówek z kluczem admina; nie hardkoduj sekretu, opisz jak go ustawić) zwracający agregaty: liczba prób i urządzeń, rozkład wyniku, % "ocena się zgadza", najczęściej źle oceniane nuty, mediana opóźnienia per typ urządzenia, odsetek błędów oktawy/duodecymy, plus eksport surowych rekordów jako JSON/CSV z filtrem dat. Dodaj skrypt w `functions/scripts` lub opis w README, jak to pobrać curlem. Jeśli wdrożenie sekretu wymaga ręcznego kroku właściciela w konsoli Firebase/GCP, wypisz ten krok wyraźnie.
6. Testy: jednostkowe dla budowania rekordu i kolejki offline (klient), walidacji, rate limitu i agregatów (functions, także w emulatorze — jest `functions/test-emulator`). Istniejące testy, lint, typecheck i build mają przechodzić. Sprawdź, że CI/deploy obejmuje functions i że preview działa.

Areas (orchestrator with Jev):
A1 Backend ingest — endpoints in Cloud Function `api` for an attempt record and its feedback update: validation, size limits, rate limit per deviceId, Firestore `spikeNutyAttempts` with `expireAt` TTL, README on enabling TTL; builds on nothing
A2 Client telemetry — in `src/spike-nuty/`: record building, offline queue with retry, result-screen feedback (Tak/Nie, misjudged-note toggles, comment), Polish notice and local opt-out toggle; builds on A1
A3 Owner stats and export — secret-protected endpoint in `api` with aggregates and JSON/CSV export with date filter, curl script/README, manual secret-setup step documented; builds on A1
