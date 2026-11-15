# Client feedback 1 (increment 1)

### Piotr (piotr@rocksoft.pl, owner) — 2026-11-15 — PR #22 (given in the local session, covers PRs #22, #23, #24)

Feedback właściciela do zmiany `telemetria-zagraj-i-sprawdz` (otwarte PR-y: #22 backend, branch `feat/telemetria-zagraj-i-sprawdz/1`; #23 aplikacja, branch `feat/telemetria-zagraj-i-sprawdz/2`; #24 statystyki, branch `feat/telemetria-zagraj-i-sprawdz/3`). Commituj na ISTNIEJĄCYCH branchach i pushuj, żeby PR-y i preview się zaktualizowały. Bez nowych PR-ów.

Uwaga właściciela (dosłownie): "Nie trzeba się pytać i poprawiać. To ma dziać się automatycznie. Inaczej nikt tego nie będzie robił."

Czyli:
1. USUŃ z aplikacji (#23) ręczną informację zwrotną: pytanie "Czy ocena się zgadza? Tak/Nie", zaznaczanie źle ocenionych nut i komentarz. Usuń odpowiadający endpoint/walidację oceny z backendu (#22) i agregaty "% ocena się zgadza" ze statystyk (#24), albo zostaw je martwe tylko jeśli usunięcie byłoby ryzykowne – opisz decyzję. Zostaje automatyczna wysyłka rekordu próby, krótka informacja o anonimowych danych i przełącznik wyłączenia.
2. ZAMIAST tego automatycznie szacuj dokładność rozpoznawania z samych danych (czysta, testowana logika, liczona na kliencie i zapisywana w rekordzie, plus agregowana w statystykach #24). Każdą nutę z listy nuta po nucie i każde zdarzenie klasyfikuj heurystycznie jako "prawdopodobny błąd grającego" vs "prawdopodobny błąd rozpoznawania" vs "niepewne", np.:
   - podejrzane o błąd rozpoznawania: skok dokładnie o oktawę (±12) lub duodecymę (+19) względem wzorca; bardzo krótkie zdarzenia (np. < 120 ms) lub zdarzenia o niskiej pewności (clarity) / niskim poziomie; jedna wzorcowa nuta rozbita na kilka zdarzeń tej samej wysokości albo powtórzone nuty zlane w jedno (liczba zdarzeń vs liczba nut wzorca); duża niestabilność wysokości w obrębie nuty; brakująca nuta przy wysokim poziomie sygnału w tym czasie;
   - prawdopodobny błąd grającego: stabilna, pewna nuta o innej wysokości (sąsiedni stopień gamy / pół tonu, nie oktawa); stabilne przesunięcie rytmiczne pojedynczej nuty przy dobrze trafionych pozostałych;
   - sygnały na poziomie próby: odsetek ramek bez wykrytej wysokości, mediana clarity, rozrzut opóźnienia, stosunek liczby zdarzeń do liczby nut, czy próba przerwana. Także powtórzenia: ten sam deviceId + utwór zagrany ponownie w ciągu kilku minut z bardzo różnym wynikiem (liczone w statystykach na serwerze).
   - Wylicz "szacowaną dokładność rozpoznawania" próby (np. 1 − udział nut podejrzanych o błąd rozpoznawania) i zapisz wersję heurystyki w rekordzie, żeby dało się ją później przeliczyć na surowych danych.
   - Statystyki (#24): rozkład szacowanej dokładności, top typów podejrzanych błędów rozpoznawania, per utwór, per nuta, per typ urządzenia, trend w czasie (dziennie), oraz skrypt przeliczający heurystykę ponownie na surowych rekordach.
   - Dziecko NIE widzi tych heurystyk (to dla nas). Panel diagnostyczny może je pokazywać.
3. Poprawka UI: na 360 px tabela "Nuta po nucie" jest ściśnięta i ucina tekst (np. "dobrz" zamiast "dobrze"). Zrób ją czytelną (zawijanie, krótsze nagłówki, ikony/kolor statusu albo układ kart) na 360 px.

Wymagania: UI po polsku, testy jednostkowe dla heurystyk (syntetyczne przypadki każdego typu), aktualizacja testów backendu/emulatora, wszystkie testy, lint, typecheck i build przechodzą. Opisz zmiany w komentarzach PR.

Autoryzacja od właściciela (Piotr): commit i push na trzy branche `feat/telemetria-zagraj-i-sprawdz/{1,2,3}`. NIE merguj i NIE pushuj do main.
