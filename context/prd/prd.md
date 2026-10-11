---
project: Grajek
version: 1
status: draft
created: 2026-10-11
context_type: greenfield
product_type: web-app
target_scale:
  users: small
---

# Grajek — PRD

Źródło: [discovery-notes.md](../discovery/discovery-notes.md), [glossary.md](../discovery/glossary.md), [research-motivation.md](../discovery/research-motivation.md).

## Vision & Problem Statement

Uczniowi w wieku 7–13 lat czasami się nie chce i ciężko mu się zmotywować do ćwiczeń na instrumencie. Dzieje się to najczęściej po szkole i zajęciach, gdy dziecko jest zmęczone, a instrument przegrywa z innymi rozrywkami. Dziś kosztuje to tyle, że rodzic musi gonić do ćwiczeń, a w dłuższej perspektywie dziecko rezygnuje z nauki.

Grajek to aplikacja na telefon, której celem jest **systematyczność ćwiczeń**, a nie ocena gry. Ma angażować, nagradzać i dopingować, ale nie uzależniać: jest tylko elementem dopingującym, nie miejscem do spędzania czasu przed ekranem. Całkowicie darmowa, bez reklam i bez celu komercyjnego. Przewaga: istniejące aplikacje są dla dorosłych i płatne albo opierają się na punktach, sklepie i rankingach, które według badań podkopują motywację wewnętrzną dzieci. Brakuje prostej, etycznie zaprojektowanej aplikacji dla dzieci.

## User & Persona

**Uczeń** w wieku szkolnym, 7–13 lat, uczący się gry na dowolnym instrumencie. Sięga po Grajka tuż po ćwiczeniu, żeby je zapisać, oraz o swojej porze ćwiczeń, gdy dostaje przypomnienie. Na razie jedynym użytkownikiem jest Uczeń; rodzic to opcja na później (wgląd w postępy dziecka) — dziś ogląda Kartę postępu albo ekran telefonu.

## Success Criteria

### Primary

Pierwsza wersja działa od początku do końca:
1. Uczeń przy pierwszym uruchomieniu wpisuje imię lub pseudonim i dodaje swój instrument.
2. Wybiera Cel tygodniowy (np. 4 dni z 7) i swoją Porę ćwiczeń.
3. O wybranej porze dostaje jedno łagodne powiadomienie (pełne powiadomienia od pierwszej wersji).
4. Po ćwiczeniu zapisuje je w ok. 10 sekund: czas, opcjonalnie nad czym pracował i emoji samopoczucia.
5. Widzi swój tydzień i miesiąc: Dni z muzyką, postęp Celu tygodniowego.
6. Czasem, bez zapowiedzi, dostaje Odznakę za wysiłek.
7. Może udostępnić Kartę postępu przez komunikator albo pokazać ekran rodzicowi.

### Secondary

Kilka instrumentów w jednym Profilu (np. pianino i flet w szkole muzycznej), ze statystykami osobno i razem.

### Guardrails

- Zapis Ćwiczenia zajmuje ok. 10 sekund — wejście, zapis, wyjście.
- Brak mechanik uzależniających: bez waluty, sklepu, rankingów, gróźb utraty serii i więcej niż jednego powiadomienia dziennie (ADR 0002 — Grywalizacja bez waluty, rankingów i serii).
- Żadne dane identyfikujące dziecko nie opuszczają urządzenia. Poza urządzeniem znane jest tylko anonimowe urządzenie: adres powiadomień, Pora ćwiczeń i informacja, czy danego dnia był zapis (ADR 0001 — Serwer powiadomień z minimalnymi, anonimowymi danymi).
- Zapis i statystyki działają bez internetu; sieci potrzebują tylko powiadomienia.

## User Stories

### US-01: Zapis Ćwiczenia i widok postępu
- **Given** mam Profil z gitarą i Cel tygodniowy 4 dni
- **When** po ćwiczeniu zapisuję 15 minut
- **Then** widzę, że w tym tygodniu mam 3 z 4 dni, a dzisiejszy Dzień z muzyką świeci w kalendarzu

#### Acceptance Criteria
- Zapis wymaga najwyżej 3 dotknięć od ekranu głównego i działa w trybie samolotowym.
- Postęp tygodnia rośnie o jeden Dzień z muzyką przy pierwszym zapisie danego dnia (kolejne zapisy tego dnia nie zwiększają licznika dni).
- Puste dni w kalendarzu są neutralne, nie czerwone.

## Functional Requirements

### Profil i plan
- FR-001: Uczeń może utworzyć Profil (imię lub pseudonim, dowolnie) i dodać swój instrument. Priority: must-have
  - **Acceptance:** po podaniu imienia lub pseudonimu i instrumentu, zamknięciu i ponownym otwarciu aplikacji Profil jest zachowany.
  > Challenge: imię może zdradzać tożsamość dziecka. → Pole przyjmuje dowolny pseudonim; na karcie do udostępnienia nie ma danych osobowych.
- FR-002: Uczeń może wybrać Cel tygodniowy (N dni z 7) z dniem zapasu. Priority: must-have
  - **Acceptance:** po ustawieniu 4/7 ekran główny pokazuje 0/4; po zapisach w 4 różne dni tygodnia cel jest oznaczony jako osiągnięty.
  > Challenge: za wysoki cel zniechęca (7/7 = cotygodniowa porażka). → Grajek sugeruje rozsądny start (3–4 dni) i proponuje podniesienie celu dopiero po kilku udanych tygodniach.
- FR-003: Uczeń może ustalić swoją Porę ćwiczeń („kiedy i gdzie”), także różną w różne dni tygodnia. Priority: must-have
  - **Acceptance:** wybrana pora i miejsce są widoczne na ekranie głównym; można ustawić inną porę dla wybranych dni.
  > Challenge: różne dni mają różny plan (basen, angielski). → Pora może być inna dla wybranych dni.
- FR-004: Uczeń dostaje najwyżej jedno łagodne powiadomienie dziennie o swojej porze, i tylko gdy tego dnia jeszcze nie ćwiczył. Priority: must-have
  - **Acceptance:** przy porze 17:00 i braku zapisu tego dnia o 17:00 przychodzi jedno powiadomienie przy zamkniętej aplikacji; gdy zapis jest, powiadomienie nie przychodzi.
  > Challenge: codzienne przypomnienie może działać jak goniący rodzic. → Ton tylko zachęcający; uczeń łatwo wyłącza powiadomienia albo ogranicza je do dni planu.

### Ćwiczenie i postęp
- FR-005: Uczeń może zapisać Ćwiczenie w ok. 10 sekund (czas, opcjonalnie nad czym pracował, emoji). Priority: must-have
  - **Acceptance:** od ekranu głównego do zapisanego Ćwiczenia wystarczą najwyżej 3 dotknięcia; działa w trybie samolotowym.
  > Challenge: opcjonalne pola (notatka, emoji) mogą wydłużać zapis. → Domyślnie zwinięte; zapis samego czasu to jedno dotknięcie więcej niż start.
- FR-006: Uczeń widzi swój tydzień i miesiąc: Dni z muzyką i postęp celu, bez wyróżniania pustych dni. Priority: must-have
  - **Acceptance:** dni z zapisem są wyróżnione, puste są neutralne (nie czerwone); widoczny licznik „dni z muzyką w tym miesiącu”.
  > Challenge: rozbudowane statystyki zachęcają do przeglądania i wydłużają czas w aplikacji. → Jeden prosty widok, bez rozbudowanych wykresów.
- FR-007: Uczeń dostaje niezapowiedziane Odznaki za wysiłek. Priority: must-have
  - **Acceptance:** po przekroczeniu 5 godzin ćwiczeń łącznie pojawia się Odznaka, której wcześniej nie było widać na żadnej liście.
  > Challenge: dzieci chcą widzieć, co mogą zdobyć. → Lista do zdobycia zamienia odznaki w oczekiwaną nagrodę (efekt nadmiernego uzasadnienia). Zostają niespodzianki; zdobyte odznaki są zawsze widoczne w kolekcji.
- FR-008: Uczeń może udostępnić Kartę postępu. Priority: must-have
  - **Acceptance:** przycisk otwiera systemowe udostępnianie z obrazkiem karty; wybór komunikatora (np. tego, którego używa rodzina) wysyła obrazek.
  > Challenge: karty w grupie klasowej mogą zamienić się w ranking. → Karta pokazuje własny wysiłek i postęp (np. „4 dni z muzyką w tym tygodniu”), bez liczb zachęcających do licytowania się.
- FR-009: Uczeń może mieć kilka instrumentów w Profilu, ze statystykami osobno i razem. Priority: nice-to-have
  - **Acceptance:** po dodaniu drugiego instrumentu przy zapisie można go wybrać, a statystyki pokazują sumę i podział.
  > Challenge: wybór instrumentu przy każdym zapisie to dodatkowe dotknięcie. → Domyślnie podpowiada się ostatnio używany instrument.

### Zależności
- FR-002, FR-003, FR-005, FR-009 wymagają FR-001.
- FR-004 wymaga FR-003.
- FR-006, FR-007, FR-008 wymagają FR-005.

## Non-Functional Requirements

- **Szybkość:** zapis Ćwiczenia od otwarcia aplikacji w ok. 10 sekund, najwyżej 3 dotknięcia; ekran główny gotowy do użycia praktycznie od razu po otwarciu.
- **Offline:** Profil, zapis, kalendarz, Odznaki i Karta postępu działają bez internetu; sieć jest potrzebna tylko do powiadomień.
- **Urządzenia:** telefony z aktualnym Androidem i iOS, instalowalne na ekranie głównym; układ pionowy, mobile-first.
- **Czytelność dla dzieci 7–13:** duże elementy dotykowe, ikony i mało tekstu, język polski, ton wyłącznie zachęcający.
- **Prywatność:** imię ani inne dane identyfikujące nie opuszczają urządzenia; poza urządzeniem znany jest tylko anonimowy identyfikator urządzenia, Pora ćwiczeń i informacja, czy danego dnia był zapis. Brak analityki i trackerów stron trzecich, brak reklam.
- **Czas w aplikacji:** typowa wizyta trwa poniżej 30 sekund; brak elementów wydłużających sesję (feedy, autoodtwarzanie, nieskończone listy).
- **Powiadomienia:** dostarczone w okolicy wybranej pory (tolerancja kilkunastu minut).

## Business Logic

**Grajek liczy Dni z muzyką względem Celu tygodniowego wybranego przez Ucznia i nagradza wysiłek bez zapowiedzi, a przerwa nigdy nie odbiera tego, co już zdobyte.**

Wejścia widoczne dla Ucznia: zapisane Ćwiczenia (data, czas, instrument), Cel tygodniowy N z 7 i Pora ćwiczeń. Dzień z muzyką to dzień z co najmniej jednym zapisem, na dowolnym instrumencie. Tydzień jest zaliczony, gdy liczba Dni z muzyką osiąga cel; dzień zapasu oznacza, że cel nigdy nie wymaga wszystkich 7 dni.

Wyjścia: postęp bieżącego tygodnia (np. 3 z 4), licznik Dni z muzyką w miesiącu i łączny dorobek (wszystkie dni i godziny z muzyką), które tylko rosną. Nie ma serii, która spada do zera, ani komunikatów o porażce: nowy tydzień to świeży start. Odznaki przyznawane są za wysiłek (np. łączny czas, liczba Dni z muzyką, zaliczone tygodnie, powrót po przerwie), nie są zapowiadane i nie można ich stracić.

Uczeń spotyka regułę na ekranie głównym tuż po zapisie Ćwiczenia. Reguły pomocnicze: Grajek sugeruje rozsądny cel na start (3–4 dni) i proponuje podniesienie dopiero po kilku zaliczonych tygodniach; przypomina najwyżej raz dziennie, o Porze ćwiczeń Ucznia, tylko w dniu planu i tylko gdy tego dnia nie było jeszcze zapisu.

_Reguła rozstrzygnięta w discovery przez asystenta na prośbę użytkownika („zdecyduj sam”), na podstawie researchu._

## Access Control

Jeden użytkownik (Uczeń), bez logowania i bez kont. Lokalny Profil tworzony przez Ucznia; jeden Profil na urządzenie. Model płaski — jedna rola. Dane Profilu i historia Ćwiczeń są na urządzeniu; wyjątek opisuje ADR 0001 (anonimowe dane do powiadomień).

## Non-Goals

- Ocena gry i rozpoznawanie dźwięku — celem jest systematyczność, nie jakość wykonania.
- Konta, logowanie i synchronizacja między urządzeniami — Profil jest lokalny.
- Widok rodzica i rola nauczyciela — na później; na razie rodzic dostaje Kartę postępu albo ogląda ekran.
- Mapa przygody — do sprawdzenia po pierwszej wersji, czy działa pozytywnie.
- Waluta, sklep, nagrody do odblokowania, losowe nagrody — podkopują motywację wewnętrzną dzieci.
- Rankingi, porównania i funkcje społecznościowe — prowadzą do presji i licytowania się.
- Kilka Profili na jednym urządzeniu — na później.
- Natywna aplikacja mobilna — później, jeśli wersja w przeglądarce się sprawdzi.
- Monetyzacja, reklamy, płatne funkcje — projekt niekomercyjny.

## Open Questions

1. **Czy anonimowe dane do powiadomień wymagają zgody rodzica?** Użytkownik zakłada, że anonimowy profil (adres powiadomień + informacja o zapisach, bez imienia) nie wymaga zgody. Według RODO identyfikator urządzenia z danymi o zachowaniu może nadal być daną osobową (motyw 30), a w PL wiek zgody cyfrowej to 16 lat. — Owner: użytkownik (weryfikacja prawna). By: przed publiczną publikacją. Block: nie dla budowy, tak dla publikacji.
2. **Utrata danych przy czyszczeniu przeglądarki lub zmianie telefonu.** Czy potrzebny jest eksport/import kopii (np. plik)? — Owner: użytkownik. Block: nie.
3. **Katalog Odznak i progi** (np. 5 h, 10 Dni z muzyką, powrót po przerwie). — Owner: planowanie pierwszego przyrostu. Block: nie.
