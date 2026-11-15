---
change_id: spike-zagraj-i-sprawdz
title: Spike "Play and check" - record an instrument to a metronome and grade notes on a staff
status: impl_reviewed
created: 2026-11-15
updated: 2026-11-15
archived_at: null
---

## Notes

Requested by: piotr@rocksoft.pl

SPIKE (prototyp do wyrzucenia, nie produkcja) – "Zagraj i sprawdź": dziecko wybiera prosty utwór, gra go na instrumencie do metronomu, telefon nagrywa przez mikrofon, a aplikacja pokazuje na pięciolinii nuty wzorcowe i zagrane oraz zaznacza każdą nutę jako dobrą lub złą.

Cel spike'a: sprawdzić na prawdziwym iPhonie (PWA, Safari iOS) z prawdziwym instrumentem, czy rozpoznawanie pojedynczych nut (melodia, bez akordów) i rytmu do metronomu działa wystarczająco dobrze, żeby budować pełną funkcję. Właściciel produktu przetestuje to na telefonie na preview PR.

Zakres (świadomie minimalny):
- Ukryty ekran spike'a, dostępny tylko przez URL z parametrem `?spike=nuty`; reszta aplikacji bez zmian, bez linku w UI.
- Instrument testowy: KLARNET B♭ (dziecko początkujące). To instrument transponujący: zapis brzmi o sekundę wielką (2 półtony) niżej. Nuty na pięciolinii pokazuj w ZAPISIE klarnetowym (tak jak w nutach dziecka, klucz wiolinowy), a wykrytą wysokość brzmiącą przeliczaj +2 półtony na zapis. Zrób tę transpozycję konfigurowalną (wybór: Klarnet B♭ / Instrument w C), domyślnie klarnet B♭.
- 2-3 zaszyte na sztywno, bardzo proste melodie dla początkującego klarnecisty, w niskim rejestrze (chalumeau) bez przechodzenia przez przełamanie rejestrów, czyli w zapisie mniej więcej E3–G4 (np. "Wlazł kotek na płotek", "Panie Janie", proste ćwiczenie na dźwiękach E-F-G / C-D-E-F-G), w ćwierćnutach i półnutach.
- Porównanie wysokości dokładne, z oktawą (klarnet ma jednoznaczny rejestr). Pozostaw przełącznik "ignoruj oktawę", ale domyślnie WYŁĄCZONY. Uwaga dla detekcji: klarnet ma słabe parzyste harmoniczne, co zwykle ułatwia detekcję, ale pilnuj błędów oktawy/kwinty (dwunastki przy przedęciu) i pokaż je w panelu diagnostycznym.
- Regulowane tempo (np. 60-100 BPM), domyślnie wolno (60). Metronom (Web Audio, kliknięcie z mocniejszym pierwszym taktem) z jednym taktem odliczania przed nagraniem; najlepiej wizualny znacznik bieżącego taktu/nuty.
- Nagrywanie mikrofonem (getUserMedia, bez wysyłania czegokolwiek na serwer), wykrywanie wysokości dźwięku na żywo dowolnym sprawdzonym algorytmem dla monofonii (np. biblioteka `pitchy` (McLeod) albo YIN), wykrywanie początku nut (onset/zmiana wysokości/głośności), kwantyzacja do siatki metronomu (min. ósemki).
- Uwaga: metronom gra przez głośnik w czasie nagrywania – zadbaj, żeby kliknięcia nie były wykrywane jako nuty (np. krótkie kliknięcia o nietonalnym brzmieniu, ignorowanie ramek tuż po kliknięciu albo opcja "tylko wizualny metronom").
- Render pięciolinii (np. VexFlow albo abcjs): wzorzec i to, co zagrano, z kolorami zielony = dobra wysokość i rytm, żółty = dobra wysokość, zły rytm, czerwony = zła nuta / brakująca. Wynik procentowy.
- Panel diagnostyczny (dla nas, nie dla dziecka): bieżąca częstotliwość w Hz, nazwa nuty, odchylenie w centach, poziom głośności, surowa lista wykrytych zdarzeń (nuta, początek w ms, długość). To jest kluczowe do oceny spike'a.
- Działa na iOS Safari w trybie standalone PWA (AudioContext odblokowany gestem użytkownika, obsługa odmowy uprawnień mikrofonu z czytelnym komunikatem po polsku). Teksty UI po polsku.
- Testy jednostkowe dla czystej logiki (Hz→nuta, kwantyzacja, porównanie z wzorcem na syntetycznych danych). E2E nie jest wymagane poza tym, że istniejące testy mają przechodzić.
- Kod spike'a w osobnym katalogu (np. `src/spike-nuty/`), ładowany leniwie (dynamic import), żeby nie zwiększać głównego bundla. Dopisz krótkie README w tym katalogu: co sprawdzamy, jak testować, i miejsce na werdykt.

Autoryzacja od właściciela: wolno dodać zależności potrzebne spike'owi (np. pitchy, vexflow/abcjs) – są ładowane leniwie i nie wchodzą do głównego bundla. Sesja nienadzorowana – podejmuj rozsądne decyzje sam (rs-core §1).
