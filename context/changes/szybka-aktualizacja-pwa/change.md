---
change_id: szybka-aktualizacja-pwa
title: Fast and reliable PWA updates after a new deploy
status: impl_reviewed
created: 2026-10-11
updated: 2026-10-11
archived_at: null
---

## Notes

Po wdrożeniu nowej wersji użytkownik na iPhonie (Safari / PWA) nadal widzi starą wersję aplikacji (ekran powitalny z F-01 zamiast formularza profilu), bo service worker serwuje stary precache, a nowa wersja przejmuje kontrolę dopiero po zamknięciu wszystkich kart. Popraw mechanizm aktualizacji tak, żeby nowa wersja wchodziła szybko i niezawodnie: np. vite-plugin-pwa registerType 'autoUpdate' (skipWaiting + clientsClaim) z bezpiecznym przeładowaniem strony, gdy nowy SW przejmie kontrolę (tylko gdy uczeń nie jest w trakcie wypełniania formularza/zapisu — rozstrzygnij autonomicznie; alternatywnie dyskretny komunikat „Jest nowa wersja — odśwież”), sprawdzanie aktualizacji przy powrocie aplikacji na pierwszy plan (visibilitychange) i okresowo. Zachowaj działanie offline i nagłówki no-cache z firebase.json. Uwaga na migracje IndexedDB: nowa wersja musi otwierać bazę po przeładowaniu bez blokowania (mechanizm onClose/VersionError już istnieje).
