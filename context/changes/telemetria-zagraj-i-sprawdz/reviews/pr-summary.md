<!-- preview-link -->

**Co zmienia się po Twoich uwagach:** Statystyki nie liczą już „% ocena się zgadza” ani najczęściej źle ocenianych nut, bo ręczne pytanie znika z aplikacji. Zamiast tego pokazują automatycznie szacowaną dokładność rozpoznawania: rozkład tej dokładności, najczęstsze rodzaje podejrzanych błędów rozpoznawania, zestawienia według utworu, nuty, typu urządzenia i dnia, sygnały jakości dźwięku w próbach oraz liczbę powtórzeń (to samo urządzenie i utwór zagrane ponownie w ciągu kilku minut z bardzo różnym wynikiem). Starsze próby bez oszacowania są szacowane na serwerze tą samą metodą. Eksport też nie ma już kolumn ręcznej oceny, ma za to kolumny oszacowania.

**Przeliczanie:** dochodzi skrypt, który po zmianie metody szacowania przelicza zapisane próby od nowa. Domyślnie tylko pokazuje, co by się zmieniło; zapis wymaga osobnej flagi, a uruchomienie na prawdziwych danych wymaga jawnego wskazania projektu. Instrukcja będzie w README.

**Do sprawdzenia po wdrożeniu:**
- Pobierz statystyki z kluczem i sprawdź, że widać rozkład szacowanej dokładności i zestawienia dzienne.
- Uruchom skrypt przeliczający bez flagi zapisu i sprawdź, że tylko raportuje zmiany.

Ta część opiera się na pierwszej części (zapis danych na serwerze) i jest wdrażana po niej.

**Status:** Jeszcze nie gotowe: statystyki są przebudowywane według Twoich uwag.
