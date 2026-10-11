---
project: Grajek
version: 1
status: draft
created: 2026-10-11
updated: 2026-10-11
prd_version: 1
main_goal: market-feedback   # decyzja autonomiczna: jak najszybciej dać aplikację dzieciom i sprawdzić, czy pomaga w systematyczności
top_blocker: capacity        # decyzja autonomiczna: projekt niekomercyjny, budowany po godzinach — stąd szerokie „Parallel with”
---

# Grajek — roadmapa

Źródło: [prd.md](../prd/prd.md) v1. Ramowanie (main_goal, north star, top_blocker) rozstrzygnięte autonomicznie na prośbę użytkownika („nie pytaj”), zgodnie z rekomendacjami.

## Vision recap

Grajek to darmowa aplikacja na telefon dla uczniów 7–13 lat, która pomaga systematycznie ćwiczyć na dowolnym instrumencie. Nie ocenia gry: dopinguje, nagradza wysiłek bez zapowiedzi i nigdy nie odbiera tego, co już zdobyte. Wizyta trwa kilka sekund — wejście, zapis, wyjście — bez reklam, rankingów i mechanik uzależniających.

## North star

**North star** to jeden przyrost, który najwcześniej sprawdza główną hipotezę produktu. Dla Grajka jest nim **S-02 — zapis Ćwiczenia w ok. 10 sekund z widokiem bieżącego tygodnia** (US-01, FR-005; Primary Success Criterion pkt 4–5). Jeśli dziecko nie zechce codziennie zapisywać ćwiczenia, reszta mechanik nie ma na czym się oprzeć. Pełne US-01 („3 z 4 dni”) domyka S-03 (Cel tygodniowy).

## At a glance

| ID | Change ID | Outcome | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | szkielet-aplikacji-offline | Uczeń może zainstalować pustą aplikację na telefonie i otworzyć ją bez internetu | — | NFR Offline, NFR Urządzenia | ready |
| F-02 | anonimowa-rejestracja-urzadzenia | Urządzenie może zarejestrować się anonimowo do powiadomień | — | FR-004, NFR Prywatność, ADR 0001 | ready |
| S-01 | profil-i-instrument | Uczeń może utworzyć Profil i dodać instrument | F-01 | FR-001 | proposed |
| S-02 | zapis-cwiczenia | Uczeń może zapisać Ćwiczenie w ok. 10 s i zobaczyć je w bieżącym tygodniu | S-01 | FR-005, FR-006, US-01 | proposed |
| S-03 | cel-tygodniowy | Uczeń może wybrać Cel tygodniowy i widzieć postęp tygodnia | S-02 | FR-002, US-01 | proposed |
| S-04 | widok-miesiaca | Uczeń może zobaczyć miesiąc i łączny dorobek Dni z muzyką | S-02 | FR-006 | proposed |
| S-05 | odznaki-za-wysilek | Uczeń dostaje niezapowiedziane Odznaki i widzi ich kolekcję | S-02 | FR-007 | proposed |
| S-06 | karta-postepu | Uczeń może udostępnić Kartę postępu | S-02 | FR-008 | proposed |
| S-07 | pora-cwiczen | Uczeń może ustalić Porę ćwiczeń, także różną w różne dni | S-01 | FR-003 | proposed |
| S-08 | przypomnienie-o-porze | Uczeń dostaje najwyżej jedno łagodne przypomnienie dziennie | F-02, S-02, S-07 | FR-004 | proposed |
| S-09 | kilka-instrumentow | Uczeń może mieć kilka instrumentów ze statystykami osobno i razem | S-02 | FR-009 | proposed |

## Streams

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A — Rdzeń | Zapis i postęp | F-01 → S-01 → S-02 → S-03 → S-04 | Zawiera north star (S-02). |
| B — Motywacja | Nagradzanie i dzielenie się | S-02 → S-05, S-06, S-09 | Równolegle po S-02. |
| C — Przypomnienia | Pora i powiadomienia | F-02 → S-07 → S-08 | F-02 może ruszyć od razu, równolegle z F-01. |

## Baseline

- **Frontend:** absent — repozytorium zawiera tylko dokumenty w `context/`.
- **Backend/API:** absent — brak kodu.
- **Data:** absent — brak kodu.
- **Auth:** absent — i nie jest potrzebny: PRD zakłada brak logowania i kont (Access Control).
- **Deployment/infra:** absent — brak konfiguracji.
- **Observability:** absent — PRD wyklucza analitykę i trackery stron trzecich; świadomie bez fundamentu.

## Foundations

### F-01: Szkielet aplikacji działającej offline
- **Outcome:** Uczeń może zainstalować aplikację na ekranie głównym telefonu i otworzyć ją bez internetu (ekran powitalny).
- **Change ID:** szkielet-aplikacji-offline
- **PRD refs:** NFR Offline, NFR Urządzenia, NFR Czytelność dla dzieci 7–13
- **Prerequisites:** — (stos deklaruje rs-init w ramach tej zmiany)
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** różnice w instalowaniu i działaniu offline między Androidem a iOS.
- **Status:** ready
- **Unlocks:** S-01 (i pośrednio cały stream A i B); minimalny kontrakt lokalnego przechowywania danych i publikacji — bez żadnej funkcji produktu.

### F-02: Anonimowa rejestracja urządzenia do powiadomień
- **Outcome:** urządzenie może zarejestrować się anonimowo (bez imienia i danych identyfikujących) do odbioru powiadomień.
- **Change ID:** anonimowa-rejestracja-urzadzenia
- **PRD refs:** FR-004, NFR Prywatność, NFR Powiadomienia, ADR 0001
- **Prerequisites:** —
- **Parallel with:** F-01, S-01, S-02, S-03
- **Blockers:** —
- **Unknowns:** czy anonimowe dane wymagają zgody rodzica (RODO) — Owner: użytkownik — Block: no (blokuje publikację, nie budowę)
- **Risk:** dostarczanie powiadomień na iOS do aplikacji instalowanej z przeglądarki jest ograniczone.
- **Status:** ready
- **Unlocks:** S-08; ścieżkę weryfikacji dostarczania powiadomień na obu platformach.

## Slices

### S-01: Profil i instrument
- **Outcome:** Uczeń może utworzyć Profil (imię lub pseudonim) i dodać swój instrument; Profil przetrwa zamknięcie aplikacji.
- **Change ID:** profil-i-instrument
- **PRD refs:** FR-001
- **Prerequisites:** F-01
- **Parallel with:** F-02, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** zbyt długi start zniechęci 7-latka zanim zapisze pierwsze ćwiczenie.
- **Status:** proposed

### S-02: Zapis Ćwiczenia z widokiem tygodnia (north star)
- **Outcome:** Uczeń może zapisać Ćwiczenie w ok. 10 s (najwyżej 3 dotknięcia, offline) i zobaczyć dzisiejszy Dzień z muzyką w bieżącym tygodniu.
- **Change ID:** zapis-cwiczenia
- **PRD refs:** FR-005, FR-006 (widok tygodnia), US-01
- **Prerequisites:** S-01
- **Parallel with:** F-02, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** opcjonalne pola (notatka, emoji) mogą wydłużyć zapis ponad 10 s.
- **Status:** proposed

### S-03: Cel tygodniowy
- **Outcome:** Uczeń może wybrać Cel tygodniowy (N z 7, z sugestią 3–4) i widzieć postęp tygodnia; po osiągnięciu cel jest oznaczony, nowy tydzień to świeży start.
- **Change ID:** cel-tygodniowy
- **PRD refs:** FR-002, US-01, Business Logic
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-05, S-06, S-07, S-09, F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** propozycja podniesienia celu może być odebrana jako presja.
- **Status:** proposed

### S-04: Widok miesiąca i łączny dorobek
- **Outcome:** Uczeń może zobaczyć miesiąc z Dniami z muzyką (puste dni neutralne) i łączny dorobek, który tylko rośnie.
- **Change ID:** widok-miesiaca
- **PRD refs:** FR-006, Business Logic
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-05, S-06, S-07, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** widok może zachęcać do przeglądania zamiast wyjścia z aplikacji.
- **Status:** proposed

### S-05: Odznaki za wysiłek
- **Outcome:** Uczeń dostaje niezapowiedziane Odznaki za wysiłek i widzi kolekcję zdobytych (bez listy do zdobycia).
- **Change ID:** odznaki-za-wysilek
- **PRD refs:** FR-007, Business Logic, ADR 0002
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04, S-06, S-07, S-09
- **Blockers:** —
- **Unknowns:** katalog Odznak i progi — Owner: rs-plan dla tej zmiany — Block: no
- **Risk:** zbyt częste odznaki tracą wartość, zbyt rzadkie nie motywują.
- **Status:** proposed

### S-06: Karta postępu
- **Outcome:** Uczeń może udostępnić obrazek Karty postępu przez systemowe udostępnianie (np. do komunikatora rodziny), bez danych osobowych i liczb do porównań.
- **Change ID:** karta-postepu
- **PRD refs:** FR-008
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04, S-05, S-07, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** systemowe udostępnianie obrazka działa różnie na różnych telefonach.
- **Status:** proposed

### S-07: Pora ćwiczeń
- **Outcome:** Uczeń może ustalić Porę ćwiczeń („kiedy i gdzie”), także różną w wybrane dni, widoczną na ekranie głównym.
- **Change ID:** pora-cwiczen
- **PRD refs:** FR-003
- **Prerequisites:** S-01
- **Parallel with:** F-02, S-02, S-03, S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** dodatkowy krok przy starcie wydłuża pierwsze uruchomienie.
- **Status:** proposed

### S-08: Przypomnienie o porze
- **Outcome:** Uczeń dostaje najwyżej jedno łagodne przypomnienie dziennie o swojej Porze ćwiczeń, tylko gdy tego dnia nie było zapisu; może je łatwo wyłączyć lub ograniczyć do dni planu.
- **Change ID:** przypomnienie-o-porze
- **PRD refs:** FR-004, NFR Powiadomienia, ADR 0001
- **Prerequisites:** F-02, S-02, S-07
- **Parallel with:** S-03, S-04, S-05, S-06, S-09
- **Blockers:** —
- **Unknowns:** czy anonimowe dane wymagają zgody rodzica (RODO) — Owner: użytkownik — Block: no (blokuje publikację, nie budowę)
- **Risk:** przypomnienie odebrane jako „goniący rodzic” zamiast dopingu.
- **Status:** proposed

### S-09: Kilka instrumentów
- **Outcome:** Uczeń może dodać kolejne instrumenty, wybrać instrument przy zapisie (domyślnie ostatnio używany) i widzieć statystyki osobno i razem.
- **Change ID:** kilka-instrumentow
- **PRD refs:** FR-009
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04, S-05, S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** wybór instrumentu dodaje dotknięcie do zapisu.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Depends on | Ready for rs-plan | Notes |
|---|---|---|---|---|---|
| F-01 | szkielet-aplikacji-offline | [F-01] Szkielet aplikacji instalowalnej i działającej offline | — | Yes | Najpierw rs-init (tech-stack.md). |
| F-02 | anonimowa-rejestracja-urzadzenia | [F-02] Anonimowa rejestracja urządzenia do powiadomień | — | Yes | Może iść równolegle z F-01. |
| S-01 | profil-i-instrument | [S-01] Profil ucznia i instrument | F-01 | No | |
| S-02 | zapis-cwiczenia | [S-02] Zapis ćwiczenia w 10 sekund z widokiem tygodnia | S-01 | No | North star. |
| S-03 | cel-tygodniowy | [S-03] Cel tygodniowy z dniem zapasu | S-02 | No | Domyka US-01. |
| S-04 | widok-miesiaca | [S-04] Widok miesiąca i łączny dorobek | S-02 | No | |
| S-05 | odznaki-za-wysilek | [S-05] Niezapowiedziane odznaki za wysiłek | S-02 | No | Katalog odznak ustala rs-plan. |
| S-06 | karta-postepu | [S-06] Karta postępu do udostępnienia | S-02 | No | |
| S-07 | pora-cwiczen | [S-07] Pora ćwiczeń, także różna w różne dni | S-01 | No | |
| S-08 | przypomnienie-o-porze | [S-08] Jedno łagodne przypomnienie dziennie | F-02, S-02, S-07 | No | Przed publikacją: weryfikacja RODO. |
| S-09 | kilka-instrumentow | [S-09] Kilka instrumentów w profilu | S-02 | No | Nice-to-have. |

## Open Roadmap Questions

1. **Czy anonimowe dane do powiadomień wymagają zgody rodzica?** Użytkownik zakłada, że anonimowy profil (adres powiadomień + informacja o zapisach, bez imienia) nie wymaga zgody. Według RODO identyfikator urządzenia z danymi o zachowaniu może nadal być daną osobową (motyw 30), a w PL wiek zgody cyfrowej to 16 lat. — Owner: użytkownik (weryfikacja prawna). Block: no (blokuje publikację, nie budowę).
2. **Utrata danych przy czyszczeniu przeglądarki lub zmianie telefonu.** Czy potrzebny jest eksport/import kopii (np. plik)? — Owner: użytkownik. Block: no.
3. **Katalog Odznak i progi** (np. 5 h, 10 Dni z muzyką, powrót po przerwie). — Owner: rs-plan dla S-05. Block: no.
4. **Gdzie i pod jaką nazwą publikujemy aplikację** (repozytorium na GitHubie, domena)? Repozytorium istnieje dziś tylko lokalnie. — Owner: użytkownik. Block: no (potrzebne przed pierwszą publikacją po F-01).

## Parked

- Ocena gry i rozpoznawanie dźwięku — celem jest systematyczność, nie jakość wykonania.
- Konta, logowanie i synchronizacja między urządzeniami — Profil jest lokalny.
- Widok rodzica i rola nauczyciela — na później.
- Mapa przygody — do sprawdzenia po pierwszej wersji, czy działa pozytywnie.
- Waluta, sklep, nagrody do odblokowania, losowe nagrody — podkopują motywację wewnętrzną (ADR 0002).
- Rankingi, porównania i funkcje społecznościowe.
- Kilka Profili na jednym urządzeniu — na później.
- Natywna aplikacja mobilna — później, jeśli wersja w przeglądarce się sprawdzi.
- Monetyzacja, reklamy, płatne funkcje — projekt niekomercyjny.
- Analityka użycia — wykluczona przez NFR Prywatność; ewentualna ocena skuteczności przez rozmowy z rodzicami/dziećmi.

## Done
