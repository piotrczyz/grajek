# Spike „Zagraj i sprawdź” (`?spike=nuty`)

Prototyp do wyrzucenia, nie produkcja. Ukryty ekran, dostępny tylko przez adres
z parametrem `?spike=nuty`; reszta aplikacji działa bez zmian i nie ma do niego
linku.

## Co sprawdzamy

Czy na prawdziwym iPhonie (PWA, Safari iOS) z prawdziwym klarnetem B♭ da się
wystarczająco dobrze rozpoznać:

- wysokość pojedynczych nut (melodia, bez akordów), w tym w niskim rejestrze
  (E3–A3 w zapisie), bez błędów oktawy i duodecymy;
- rytm względem metronomu (nuta na właściwą ósemkę, właściwa długość);
- czy kliknięcia metronomu nie są brane za nuty.

Wynik ma pomóc zdecydować, czy budować pełną funkcję „Zagraj i sprawdź”.

## Jak testować na iPhonie

1. Otwórz preview PR-a z dopiskiem `?spike=nuty` na końcu adresu
   (np. `https://<preview>/?spike=nuty`).
2. Dodaj stronę do ekranu początkowego (Udostępnij → Do ekranu początkowego)
   i otwórz ją z ikony, żeby test szedł w trybie PWA.
3. Wybierz „Czas na przygotowanie” (3, 5 albo 10 s; domyślnie 5 s). Nuty
   wzorcowe są widoczne na pięciolinii od razu, jeszcze przed startem.
4. Naciśnij Start i zezwól na mikrofon. Duży napis „Przygotuj się…” odlicza
   sekundy, potem metronom odlicza jeden takt (1 2 3 4), a na „Graj!” zaczynasz.
   W trakcie gry bieżąca nuta wzoru jest podświetlona na niebiesko.
5. Zagraj każdy z trzech utworów przy 60 i 90 BPM:
   - raz ze słyszalnym metronomem,
   - raz z włączonym „Tylko wizualny metronom” (odliczanie nadal słychać).
6. Po nagraniu pojawia się ekran wyniku: wynik w %, podsumowanie („8 z 10 nut
   dobrze, 2 za późno…”), legenda kolorów, dwie pięciolinie wyrównane w czasie
   („Wzór” nad „Zagrałeś”) i lista nuta po nucie (oczekiwana i zagrana nuta,
   różnica w centach, przesunięcie w ms, status). Dotknięcie nuty na
   pięciolinii podświetla jej wiersz na liście. Zagraj też celowo jedną złą nutę
   i jedną spóźnioną. „Zagraj jeszcze raz” powtarza nagranie z tymi samymi
   ustawieniami, „Zmień utwór” wraca do ustawień.
7. W panelu diagnostyki porównaj wynik z włączoną i wyłączoną „Automatyczną
   korektą opóźnienia” (przełącznik ocenia to samo nagranie od nowa). Zapisz
   „Medianę przesunięcia” i „Zastosowaną korektę” z kilku nagrań.
8. Przy ćwiczeniu E-F-G (niski rejestr) przeczytaj panel diagnostyki: Hz,
   nazwę nuty, centy, poziom i listę zdarzeń z podejrzeniem oktawy/duodecymy.

Instrument domyślny to Klarnet B♭: nuty na pięciolinii są w zapisie
klarnetowym (wykryta wysokość brzmiąca + 2 półtony). „Instrument w C” wyłącza
transpozycję.

## Werdykt

_Do uzupełnienia po teście na iPhonie: czy rozpoznawanie wysokości i rytmu jest
wystarczające, co nie działało, rekomendacja (budować / nie budować / co
zmienić)._

- Mediana przesunięcia na tym urządzeniu (ms, przy 60 i 90 BPM) i czy z
  automatyczną korektą poprawne zagranie wychodzi w większości na zielono: _…_
- Czy powtórzone nuty tej samej wysokości (np. „E E” w „Wlazł kotek”) dzielą
  się na dwie nuty, czy zlewają w jedną długą (lista pokazuje wtedy „brak”): _…_
