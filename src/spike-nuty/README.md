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
3. Naciśnij Start i zezwól na mikrofon.
4. Zagraj każdy z trzech utworów przy 60 i 90 BPM:
   - raz ze słyszalnym metronomem,
   - raz z włączonym „Tylko wizualny metronom” (odliczanie nadal słychać).
5. Porównaj nuty na pięciolinii i wynik w %, zagraj też celowo jedną złą nutę
   i jedną spóźnioną.
6. Przy ćwiczeniu E-F-G (niski rejestr) przeczytaj panel diagnostyki: Hz,
   nazwę nuty, centy, poziom i listę zdarzeń z podejrzeniem oktawy/duodecymy.

Instrument domyślny to Klarnet B♭: nuty na pięciolinii są w zapisie
klarnetowym (wykryta wysokość brzmiąca + 2 półtony). „Instrument w C” wyłącza
transpozycję.

## Werdykt

_Do uzupełnienia po teście na iPhonie: czy rozpoznawanie wysokości i rytmu jest
wystarczające, co nie działało, rekomendacja (budować / nie budować / co
zmienić)._
