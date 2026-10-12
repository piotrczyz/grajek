# Client feedback 1 (increment 1)

### Piotr (product owner) — 2026-10-12 — PR #18

Wybór dnia w panelu „Ile grałeś?” → „Kiedy grałeś?” ma wyglądać jak oś czasu — wszystkie 4 dni w JEDNEJ linii, chronologicznie od najstarszego do dzisiaj, od lewej do prawej (np. dziś poniedziałek: Pt · Sob/Przedwczoraj · Wczoraj · Dziś). Obecnie to siatka 2×2 w kolejności Dziś, Wczoraj / Przedwczoraj, Pt (zrzut ekranu: C:\Users\NUC\AppData\Local\hermes\profiles\koda_grajek\cache\images\img_a91595488a72.jpg). „Dziś” nadal domyślnie zaznaczone (teraz na prawym końcu osi). Musi się mieścić na wąskim telefonie (ok. 360 px) bez łamania tekstu — dobierz etykiety/rozmiar tak, by były czytelne dla dzieci 7–13; rozważ wizualny akcent osi (np. linia łącząca), ale bez przesady.

Ustalenia: poprawka w ramach tego samego PR #18, na gałęzi `feat/cwiczenie-wstecz/1`. Zaktualizować testy (unit/integracyjne/e2e) do nowego układu. E2E na tej maszynie wymagają PLAYWRIGHT_BROWSERS_PATH=C:\Users\NUC\AppData\Local\ms-playwright.
