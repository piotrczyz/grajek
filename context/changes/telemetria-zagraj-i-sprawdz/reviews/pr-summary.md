<!-- preview-link -->

**Co to wnosi:** Pierwsza część zbierania anonimowych danych z ekranu „Zagraj i sprawdź”: serwer potrafi już przyjąć i zapisać wynik każdej próby oraz odpowiedź „czy ocena się zgadza”. Dane są anonimowe (bez nagrania i bez imienia) i same znikają po 180 dniach. Na tym etapie w aplikacji nic się jeszcze nie zmienia; wysyłanie z telefonu i statystyki dla właściciela przyjdą w kolejnych częściach.

**Do zrobienia po scaleniu:** nowe funkcje serwera zaczną działać dopiero po ręcznym wdrożeniu funkcji i ustawień bazy danych przez właściciela (instrukcja jest w README). Po wdrożeniu warto sprawdzić w konsoli Firebase, że automatyczne usuwanie starych danych jest włączone.

**Status:** Jeszcze niegotowe: poprawiamy limit rozmiaru jednej próby, żeby bardzo długie lub „zaszumione” nagrania nie były odrzucane.
