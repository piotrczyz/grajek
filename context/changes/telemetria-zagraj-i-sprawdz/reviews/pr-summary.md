<!-- preview-link -->

**Co to wnosi:** Statystyki dla właściciela z ekranu „Zagraj i sprawdź”: zbiorcze wyniki ze wszystkich urządzeń (liczba prób, rozkład wyników, jak często grający zgadzali się z oceną, najczęściej źle oceniane nuty, opóźnienia według typu urządzenia) oraz pobranie wszystkich zapisanych prób jako plik JSON lub CSV. Dostęp jest chroniony tajnym kluczem, który zna tylko właściciel. Ta część opiera się na pierwszej części (zapis danych na serwerze) i jest wdrażana po niej, jako ostatnia z trzech.

**Krok ręczny właściciela przed wdrożeniem funkcji:** zanim następny raz wdrożysz funkcje serwera, ustaw tajny klucz `SPIKE_NUTY_ADMIN_KEY` (długa losowa wartość, instrukcja w README). Bez niego wdrożenie funkcji się nie uda. Funkcje wdrażasz ręcznie: automat po scaleniu publikuje tylko stronę aplikacji, nie funkcje serwera.

**Do sprawdzenia po wdrożeniu:**
- Pobierz statystyki z kluczem (polecenie w README) i sprawdź, że przychodzą liczby z ostatnich 30 dni.
- Pobierz eksport CSV i otwórz go w arkuszu.

**Status:** Gotowe do scalenia po pozostałych dwóch częściach; podgląd strony nic tu nie zmienia, sprawdzenie jest możliwe dopiero po ręcznym wdrożeniu funkcji.
