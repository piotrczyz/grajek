<!-- preview-link -->

**Co zmieniło się po Twoich uwagach:** Statystyki nie liczą już „% ocena się zgadza” ani najczęściej źle ocenianych nut, bo ręczne pytanie znika z aplikacji. Zamiast tego pokazują automatycznie szacowaną dokładność rozpoznawania: jej rozkład, najczęstsze rodzaje podejrzanych błędów rozpoznawania, zestawienia według utworu, nuty, typu urządzenia i dnia, sygnały jakości dźwięku w próbach oraz powtórzenia (to samo urządzenie i utwór zagrane ponownie w ciągu 5 minut z wynikiem różnym o co najmniej 30 punktów). Starsze próby bez oszacowania, albo oszacowane starszą metodą, są szacowane na serwerze od nowa. Eksport ma kolumny oszacowania zamiast kolumn ręcznej oceny.

**Przeliczanie:** doszedł skrypt, który po zmianie metody szacowania przelicza zapisane próby. Domyślnie tylko pokazuje, co by się zmieniło; zapis wymaga osobnej flagi, a uruchomienie na prawdziwych danych wymaga jawnego wskazania projektu. Instrukcja jest w README.

Ta część opiera się na pierwszej części (zapis danych na serwerze) i jest wdrażana po niej.

**Do sprawdzenia po wdrożeniu:**
- Pobierz statystyki z kluczem i sprawdź, że widać rozkład szacowanej dokładności oraz zestawienia dzienne.
- Uruchom skrypt przeliczający bez flagi zapisu i sprawdź, że tylko raportuje zmiany.

**Status:** Gotowe do scalenia po sprawdzeniu po wdrożeniu.
