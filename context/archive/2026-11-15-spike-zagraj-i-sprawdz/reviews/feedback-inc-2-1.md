# Client feedback 1 (increment 2)

### Piotr (piotr@rocksoft.pl), relayed from a local session — 2026-11-15 — PR #20

Właściciel przetestował na iPhonie z klarnetem. Zrzut ekranu wyniku: C:\Users\NUC\AppData\Local\hermes\profiles\koda_grajek\cache\documents\native-inputs\eb69751b7cfe43ded72b7a8f109e5bae013eaba6100245f9e7f46e61be96dcdc\img_765a389165d2.jpg (obejrzyj go).

Uwagi właściciela:
1. "Przydałby się jakiś cold start, żeby można było się przygotować." Dziecko po naciśnięciu Start musi odłożyć telefon i przyłożyć klarnet do ust.
   - Dodaj czas na przygotowanie przed odliczaniem metronomu: duże, czytelne odliczanie "Przygotuj się… 5, 4, 3, 2, 1" (domyślnie 5 s, wybór np. 3 / 5 / 10 s), potem takt odliczania metronomu z dużymi cyframi taktu "1 2 3 4", potem "Graj!". Mikrofon i AudioContext uruchamiane od razu po kliknięciu Start (gest użytkownika na iOS), ale zdarzenia nie są nagrywane przed pierwszą nutą utworu.
   - Pokaż nuty wzorcowe już PRZED Startem i w trakcie przygotowania, żeby dziecko widziało, co ma zagrać (teraz pięciolinia jest pusta do zakończenia gry).
   - W trakcie gry podświetlaj na pięciolinii wzorca bieżącą nutę/takt.
2. "Przydałby się ekran z lepszym porównaniem." Teraz wzór i zagrane są na osobnych pięcioliniach w kolejnych systemach, nuty pod sobą się nie pokrywają w czasie (np. zagrana półnuta pod dwiema ćwierćnutami), nie wiadomo, która linia jest którą, i trudno zrozumieć, co poszło źle.
   - Zrób osobny ekran/widok wyniku po zagraniu (z przyciskami "Zagraj jeszcze raz" i "Zmień utwór").
   - Na górze: wynik w % i krótkie podsumowanie po polsku dla dziecka (np. "8 z 10 nut dobrze, 2 za późno, 1 zła nuta") oraz legenda kolorów.
   - Porównanie wyrównane w czasie: wzór i zagrane wyrównane takt w takt i uderzenie w uderzenie, tak żeby zagrana nuta stała pionowo pod nutą wzorca (ta sama szerokość taktów w obu liniach, wspólne podziały systemów). Wyraźne etykiety wierszy "Wzór" i "Zagrałeś". Alternatywnie (jeśli lepiej wygląda na 360 px) jedna pięciolinia wzorca z nutami zagranymi nałożonymi jako półprzezroczyste/kolorowe główki obok – wybierz czytelniejszy wariant i opisz decyzję w PR.
   - Brakujące nuty pokazuj jako puste miejsce/pauzę oznaczoną na czerwono w wierszu "Zagrałeś", nuty nadmiarowe jako szare.
   - Pod spodem lista nuta po nucie: nr, oczekiwana nuta, zagrana nuta, różnica w centach, przesunięcie w czasie (np. "+180 ms, za późno"), status. Po dotknięciu nuty na pięciolinii podświetl jej wiersz.
   - Spójne kolory: zielony dobrze, żółty dobra nuta zły rytm, czerwony zła/brakująca.
3. Obserwacja z testu (nie od właściciela, do rozważenia): na zrzucie bardzo dużo nut jest żółtych (rytm), co może oznaczać stałe opóźnienie toru audio na iPhonie, a nie błędy dziecka. Pokaż w diagnostyce średnie przesunięcie czasowe zagranych nut względem siatki. Dodaj prostą kalibrację opóźnienia (np. przycisk "Kalibruj": zagraj 4 razy jeden dźwięk razem z kliknięciem, zapamiętaj medianę przesunięcia w localStorage i odejmuj je) albo przynajmniej automatyczną korektę o medianę przesunięcia przed oceną rytmu. Ewentualnie poluzuj tolerancję rytmu dla tempa 60 (np. ±1/8 od początku nuty to dobrze). Opisz wybór w PR.

Wymagania jak wcześniej: UI po polsku, czytelne na 360 px w PWA iOS, testy jednostkowe dla nowej czystej logiki (wyrównanie, podsumowanie, korekta opóźnienia), istniejące testy, lint, typecheck i build mają przechodzić.

Uwaga od zleceniodawcy: commituj na tym samym branchu #20; jeśli zmiana wymaga poprawki czystej logiki z #19, można ją zrobić w #20 (to spike). Sesja nienadzorowana – decyzje podejmuj sam i opisz je w PR.
