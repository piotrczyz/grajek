---
project: Grajek
context_type: greenfield
created: 2026-10-11
updated: 2026-10-11
product_type: web-app
target_scale:
  users: small
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs-drafted: 9
  quality_check_status: accepted
---

# Grajek — discovery notes

Wejście: [research-motivation.md](research-motivation.md).

## Vision & Problem

Aplikacja na telefon dla dzieci i młodzieży uczących się gry na dowolnym instrumencie. Celem jest **systematyczność ćwiczeń**, a nie ocena gry: aplikacja nie musi wiedzieć, jak dziecko gra. Ma angażować, nagradzać i dopingować (grywalizacja: wyzwania, odznaki, trofea), ale nie może uzależniać — jest tylko elementem dopingującym, nie miejscem do spędzania czasu przed ekranem. Całkowicie darmowa, bez reklam i bez celu komercyjnego.

**Ból:** czasami się nie chce i ciężko się zmotywować.
**Kto:** uczeń 7–13 lat.
**Moment:** po szkole i zajęciach — dziecko jest zmęczone, a instrument przegrywa z innymi rozrywkami.
**Koszt dziś:** rodzic musi gonić do ćwiczeń; w dłuższej perspektywie dziecko rezygnuje z nauki.

**Przewaga (z researchu):** istniejące aplikacje są dla dorosłych i płatne (Modacity) albo opierają się na punktach, sklepie i rankingach, które według badań podkopują motywację wewnętrzną dzieci (Practice Space). Brakuje prostej, etycznie zaprojektowanej aplikacji dla dzieci.

## User & Persona

**Uczeń** w wieku szkolnym, 7–13 lat, uczący się gry na dowolnym instrumencie. Na razie jedynym użytkownikiem jest uczeń; rodzic to opcja na później (wgląd w postępy dziecka).

## Access Control

Lokalny profil tworzony przez ucznia, bez logowania i bez kont. Uczeń dodaje do profilu swój instrument. Model płaski (jedna rola: uczeń). Jeden profil na urządzenie; kilka profili (rodzeństwo na wspólnym tablecie) to temat na później.

## Success Criteria

### Primary

Pierwsza wersja działa od początku do końca:
1. Uczeń przy pierwszym uruchomieniu wpisuje imię i dodaje swój instrument.
2. Wybiera cel tygodniowy (np. 4 dni z 7) i swoją porę ćwiczeń.
3. O wybranej porze dostaje jedno łagodne powiadomienie (pełne powiadomienia od pierwszej wersji, przez serwer).
4. Po ćwiczeniu zapisuje je w ok. 10 sekund: czas, opcjonalnie nad czym pracował i emoji samopoczucia.
5. Widzi swój tydzień i miesiąc: dni z muzyką, postęp celu tygodniowego.
6. Czasem, bez zapowiedzi, dostaje odznakę za wysiłek.
7. Może udostępnić kartę ze statystykami (np. przez Telegram) albo pokazać ekran rodzicowi.

### Secondary

Kilka instrumentów w jednym profilu (np. pianino i flet w szkole muzycznej), ze statystykami osobno i razem.

### Guardrails

- Zapis ćwiczenia zajmuje ok. 10 sekund — wejście, zapis, wyjście.
- Brak mechanik uzależniających: bez waluty, sklepu, rankingów, gróźb utraty serii i więcej niż jednego powiadomienia dziennie.
- Żadne dane identyfikujące dziecko nie trafiają na serwer. Serwer zna tylko anonimowe urządzenie: adres powiadomień, porę przypomnienia i informacje o ćwiczeniach (żeby nie przypominać niepotrzebnie).
- Zapis i statystyki działają bez internetu; sieci potrzebują tylko powiadomienia.

## Functional Requirements

### Profil i plan
- FR-001: Uczeń może utworzyć profil (imię lub pseudonim, dowolnie) i dodać swój instrument. Priority: must-have
  - **Acceptance:** po podaniu imienia lub pseudonimu i instrumentu, zamknięciu i ponownym otwarciu aplikacji profil jest zachowany.
  > Challenge: imię może zdradzać tożsamość dziecka. → Pole przyjmuje dowolny pseudonim; na karcie do udostępnienia nie ma danych osobowych.
- FR-002: Uczeń może wybrać cel tygodniowy (N dni z 7) z dniem zapasu. Priority: must-have
  - **Acceptance:** po ustawieniu 4/7 ekran główny pokazuje 0/4; po zapisach w 4 różne dni tygodnia cel jest oznaczony jako osiągnięty.
  > Challenge: za wysoki cel zniechęca (7/7 = cotygodniowa porażka). → Grajek sugeruje rozsądny start (3–4 dni) i proponuje podniesienie celu dopiero po kilku udanych tygodniach.
- FR-003: Uczeń może ustalić swoją porę ćwiczeń („kiedy i gdzie”), także różną w różne dni tygodnia. Priority: must-have
  - **Acceptance:** wybrana pora i miejsce są widoczne na ekranie głównym; można ustawić inną porę dla wybranych dni.
  > Challenge: różne dni mają różny plan (basen, angielski). → Pora może być inna dla wybranych dni.
- FR-004: Uczeń dostaje najwyżej jedno łagodne powiadomienie dziennie o swojej porze, i tylko gdy tego dnia jeszcze nie ćwiczył. Priority: must-have
  - **Acceptance:** przy porze 17:00 i braku zapisu tego dnia o 17:00 przychodzi jedno powiadomienie przy zamkniętej aplikacji; gdy zapis jest, powiadomienie nie przychodzi.
  > Challenge: codzienne przypomnienie może działać jak goniący rodzic. → Ton tylko zachęcający; uczeń łatwo wyłącza powiadomienia albo ogranicza je do dni planu.

### Ćwiczenie i postęp
- FR-005: Uczeń może zapisać ćwiczenie w ok. 10 sekund (czas, opcjonalnie nad czym pracował, emoji). Priority: must-have
  - **Acceptance:** od ekranu głównego do zapisanego ćwiczenia wystarczą najwyżej 3 dotknięcia; działa w trybie samolotowym.
  > Challenge: opcjonalne pola (notatka, emoji) mogą wydłużać zapis. → Domyślnie zwinięte; zapis samego czasu to jedno dotknięcie więcej niż start.
- FR-006: Uczeń widzi swój tydzień i miesiąc: dni z muzyką i postęp celu, bez wyróżniania pustych dni. Priority: must-have
  - **Acceptance:** dni z zapisem są wyróżnione, puste są neutralne (nie czerwone); widoczny licznik „dni z muzyką w tym miesiącu”.
  > Challenge: rozbudowane statystyki zachęcają do przeglądania i wydłużają czas w aplikacji. → Jeden prosty widok, bez rozbudowanych wykresów.
- FR-007: Uczeń dostaje niezapowiedziane odznaki za wysiłek. Priority: must-have
  - **Acceptance:** po przekroczeniu 5 godzin ćwiczeń łącznie pojawia się odznaka, której wcześniej nie było widać na żadnej liście.
  > Challenge: dzieci chcą widzieć, co mogą zdobyć. → Lista do zdobycia zamienia odznaki w oczekiwaną nagrodę (efekt nadmiernego uzasadnienia). Zostają niespodzianki; zdobyte odznaki są zawsze widoczne w kolekcji.
- FR-008: Uczeń może udostępnić kartę ze statystykami. Priority: must-have
  - **Acceptance:** przycisk otwiera systemowe udostępnianie z obrazkiem karty; wybór Telegrama wysyła obrazek.
  > Challenge: karty w grupie klasowej mogą zamienić się w ranking. → Karta pokazuje własny wysiłek i postęp (np. „4 dni z muzyką w tym tygodniu”), bez liczb zachęcających do licytowania się.
- FR-009: Uczeń może mieć kilka instrumentów w profilu, ze statystykami osobno i razem. Priority: nice-to-have
  - **Acceptance:** po dodaniu drugiego instrumentu przy zapisie można go wybrać, a statystyki pokazują sumę i podział.
  > Challenge: wybór instrumentu przy każdym zapisie to dodatkowe dotknięcie. → Domyślnie podpowiada się ostatnio używany instrument.

## Dependencies
- FR-002, FR-003, FR-005, FR-009 blocked-by FR-001
- FR-004 blocked-by FR-003
- FR-006, FR-007, FR-008 blocked-by FR-005

## User Stories

### US-01: Zapis ćwiczenia i widok postępu
- **Given** mam profil z gitarą i cel 4 dni w tygodniu
- **When** po ćwiczeniu zapisuję 15 minut
- **Then** widzę, że w tym tygodniu mam 3 z 4 dni, a dzisiejszy dzień z muzyką świeci w kalendarzu

## Business Logic

_Fazy 5–6 rozstrzygnięte przez asystenta na prośbę użytkownika („zdecyduj sam”), na podstawie researchu i wcześniejszych odpowiedzi._

**Grajek liczy dni z muzyką względem celu tygodniowego wybranego przez ucznia i nagradza wysiłek bez zapowiedzi, a przerwa nigdy nie odbiera tego, co już zdobyte.**

Wejścia widoczne dla ucznia: zapisane ćwiczenia (data, czas, instrument), cel tygodniowy N z 7 i pora ćwiczeń. Dzień z muzyką to dzień z co najmniej jednym zapisem, na dowolnym instrumencie. Tydzień jest zaliczony, gdy liczba dni z muzyką osiąga cel; dzień zapasu oznacza, że cel nigdy nie wymaga wszystkich 7 dni.

Wyjścia: postęp bieżącego tygodnia (np. 3 z 4), licznik dni z muzyką w miesiącu i łączny dorobek (wszystkie dni i godziny z muzyką), które tylko rosną. Nie ma serii, która spada do zera, ani komunikatów o porażce: nowy tydzień to świeży start. Odznaki przyznawane są za wysiłek (np. łączny czas, liczba dni z muzyką, zaliczone tygodnie, powrót po przerwie), nie są zapowiadane i nie można ich stracić.

Uczeń spotyka regułę na ekranie głównym tuż po zapisie ćwiczenia. Reguły pomocnicze: Grajek sugeruje rozsądny cel na start (3–4 dni) i proponuje podniesienie dopiero po kilku zaliczonych tygodniach; przypomina najwyżej raz dziennie, o porze ucznia, tylko w dniu planu i tylko gdy tego dnia nie było jeszcze zapisu.

## Non-Functional Requirements

- **Szybkość:** zapis ćwiczenia od otwarcia aplikacji w ok. 10 sekund, najwyżej 3 dotknięcia; ekran główny gotowy do użycia praktycznie od razu po otwarciu.
- **Offline:** profil, zapis, kalendarz, odznaki i karta postępu działają bez internetu; sieć jest potrzebna tylko do powiadomień.
- **Urządzenia:** telefony z aktualnym Androidem i iOS, instalowalne na ekranie głównym; projekt pionowy, mobile-first.
- **Czytelność dla dzieci 7–13:** duże elementy dotykowe, ikony i mało tekstu, język polski, ton wyłącznie zachęcający.
- **Prywatność:** na serwer nie trafia imię ani inne dane identyfikujące; serwer zna tylko anonimowy identyfikator urządzenia, porę przypomnienia i informację, czy danego dnia był zapis. Brak analityki i trackerów stron trzecich, brak reklam.
- **Czas w aplikacji:** typowa wizyta trwa poniżej 30 sekund; brak elementów wydłużających sesję (feedy, autoodtwarzanie, nieskończone listy).
- **Powiadomienia:** dostarczone w okolicy wybranej pory (tolerancja kilkunastu minut).

## Non-Goals

- Ocena gry i rozpoznawanie dźwięku — celem jest systematyczność, nie jakość wykonania.
- Konta, logowanie i synchronizacja między urządzeniami — profil jest lokalny.
- Widok rodzica i rola nauczyciela — na później; na razie rodzic dostaje kartę postępu albo ogląda ekran.
- Mapa przygody — do sprawdzenia po pierwszej wersji, czy działa pozytywnie.
- Waluta, sklep, nagrody do odblokowania, losowe nagrody — podkopują motywację wewnętrzną dzieci.
- Rankingi, porównania i funkcje społecznościowe — prowadzą do presji i licytowania się.
- Kilka profili na jednym urządzeniu — na później.
- Natywna aplikacja mobilna — później, jeśli PWA się sprawdzi.
- Monetyzacja, reklamy, płatne funkcje — projekt niekomercyjny.

## Open Questions

- **Do weryfikacji prawnej:** użytkownik zakłada, że anonimowy profil na serwerze (adres powiadomień + dane o ćwiczeniach, bez imienia) nie wymaga zgody rodzica. Według RODO identyfikator urządzenia z danymi o zachowaniu może nadal być daną osobową (motyw 30), a w PL wiek zgody to 16 lat. Sprawdzić przed publikacją.
- Dane są tylko na telefonie: wyczyszczenie danych przeglądarki lub zmiana telefonu usuwa historię. Czy potrzebny jest eksport/import kopii (np. plik)?
- Konkretny katalog odznak i progi (np. 5 h, 10 dni z muzyką, powrót po przerwie) — do ustalenia przy planowaniu.


## Forward: tech-stack

- PWA w przeglądarce, mobile-first; natywna aplikacja mobilna później, jeśli będzie miała sens.
- Dane profilu i historia ćwiczeń przede wszystkim lokalnie na urządzeniu. Wyjątek: serwer powiadomień z anonimowym identyfikatorem urządzenia, porą przypomnienia i danymi o ćwiczeniach.
- Dzielenie się postępami bez backendu: systemowe udostępnianie (np. Telegram) albo pokazanie ekranu statystyk.
