---
change_id: zmiana-adresu-aplikacji
title: Move the app address from grajek-app.web.app to grajek.web.app
status: planned
created: 2026-10-11
updated: 2026-10-11
archived_at: null
---

## Notes

Zmień adres aplikacji z https://grajek-app.web.app na https://grajek.web.app. W projekcie Firebase `grajek-app` utworzyłem już dodatkową stronę Hosting o ID `grajek` (https://grajek.web.app). Zakres:
- firebase.json: aplikacja publikowana na stronę `grajek` (pole "site" lub target + .firebaserc), z zachowaniem obecnych rewrite'ów SPA, nagłówków cache i konfiguracji functions/firestore (F-02/S-08 — endpointy /api/** muszą działać pod nowym adresem; sprawdź rewrite do funkcji).
- Stara domyślna strona `grajek-app`: przekierowanie 301 wszystkich ścieżek na https://grajek.web.app (zachowaj ścieżkę), żeby stare linki działały. Rozważ, co z service workerem zainstalowanym na starej domenie (np. sw.js na starej stronie, który się wyrejestrowuje i przekierowuje) — rozstrzygnij autonomicznie, użytkowników produkcyjnych jest praktycznie zero.
- GitHub Actions (.github/workflows/ci.yml, FirebaseExtended/action-hosting-deploy): deploy-live i preview kanały na stronę `grajek` (parametr target/site wg dokumentacji akcji); live deploy publikuje też przekierowanie na `grajek-app`.
- Zaktualizuj wszystkie odniesienia do grajek-app.web.app w README, tech-stack.md, kodzie (manifest, CORS/allowed origins w functions, testy) na grajek.web.app. Uwaga: Web Push subskrypcje są związane z originem — odnotuj w PR, że urządzenia trzeba ponownie zarejestrować.

Extra constraints from the requester: no deploy from the local machine; e2e runs with CI=1. Note: the Firebase project id stays `grajek-app` (only the hosting site/URL changes) — references to the project id itself (e.g. .firebaserc default project, functions region URLs) must not be renamed blindly.
