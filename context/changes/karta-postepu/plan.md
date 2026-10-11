# Progress Card (Karta postępu) — Implementation Plan

## Overview
Adds one button to the home screen that draws a Progress Card image on the device (Canvas 2D, offline) from this week's practice data and the student's instrument, then opens the system share sheet with the PNG; where file sharing is unavailable the image is downloaded instead. The card shows only the student's own effort ("4 dni z muzyką w tym tygodniu", the week row, the instrument) and never the name or competitive totals (PRD FR-008, FR-001 challenge, roadmap S-06).

## Current State Analysis
- The home screen `src/profile/ProfileScreen.tsx` already holds everything the card needs: `profile.instrument.name` (`ProfileScreen.tsx:68-70`), the current week's music days as `musicDays` state (`ProfileScreen.tsx:21`), loaded by `practiceStore.listWeek(now)` (`ProfileScreen.tsx:35`) and refreshed after each save, and `now` for `weekDays(now)` (`ProfileScreen.tsx:105`).
- `App.tsx` renders `ProfileScreen` with the profile and practice store (`App.tsx:63-64`); no new data has to flow through `App.tsx`.
- Data is read-only for this change: the `practices` store with the `byDay` index exists since migration v4 (`src/storage/migrations.ts:38-43`); `PracticeStore.listWeek` (`src/practice/practiceStore.ts:36`) is sufficient. No new store, index or version bump is needed.
- Instrument icons come from `instrumentIcon(name)` (`src/profile/instruments.ts:24`); week labels and day keys from `WEEKDAY_LABELS` / `weekDays` (`src/practice/week.ts`).
- The profile name may be a real first name (`src/profile/profileStore.ts:13`; PRD FR-001 challenge: "na karcie do udostępnienia nie ma danych osobowych").
- No canvas or share code exists yet; no canvas package is installed (`package.json`). Unit tests run in jsdom (`vite.config.ts` `test.environment`), which implements neither `getContext('2d')` nor `toBlob`; e2e runs on Playwright `mobile-chromium` (Pixel 7) against `vite preview` (`playwright.config.ts`), where a real canvas exists.

## Desired End State
- On the home screen, once the current week has at least one Dzień z muzyką, a large "Pokaż rodzinie" button is visible below the week view.
- Tapping it, online or offline, produces a 1080x1080 PNG: app name "Grajek", the instrument icon and name, the headline "N dzień/dni z muzyką w tym tygodniu", the Monday-Sunday row with music days highlighted (empty days neutral), and a short encouraging line. No name, no minutes, no lifetime totals, no other identifiers.
- With Web Share Level 2 file support (`navigator.canShare({ files })`) the system share sheet opens with the image; a user cancel (`AbortError`) does nothing. Without it, or when sharing fails otherwise, the image downloads as `karta-postepu.png`.
- `App.tsx` is unchanged; no IndexedDB migration; no new dependency.

### Key discoveries
- `musicDays` and `now` already live in `ProfileScreen` (`ProfileScreen.tsx:21`, `:105`), so the button needs no extra store reads.
- jsdom has no canvas: rendering must take an injectable 2D context/canvas so it is unit-testable; the real PNG is proven in Playwright.

## What we're NOT doing
- No IndexedDB schema change, migration or version bump (parallel F-02, S-03, S-04).
- No edits to `App.tsx`.
- No weekly goal on the card (S-03 not merged), no month view or lifetime total (S-04), no badges (S-05), no multi-instrument split (S-09).
- No name, pseudonym, minutes, streak counts or comparisons on the card.
- No server upload, no link, no analytics; the image leaves the device only through the user's own share action.
- No new runtime dependency (no html2canvas, no canvas libraries).

## Implementation Approach
A new feature module `src/progress-card/` with three layers: (1) a pure card model plus Polish copy (what the card says, built from day keys, music days and the instrument), (2) a Canvas 2D renderer that draws the model onto a canvas and returns a PNG `Blob`, and (3) a share service that wraps the Blob in a `File` and calls `navigator.share` when `navigator.canShare({ files })` is true, otherwise downloads it via an object URL and a temporary `<a download>`. A small `ShareCardButton` component wires them together and is placed inside `ProfileScreen` (one import, one element), which already has the data.

Canvas 2D beat html2canvas / DOM-to-image (a new dependency, heavier, unreliable with emoji and offline fonts) and SVG-to-image (needs an image decode round-trip and font embedding). `OffscreenCanvas` was not chosen because `HTMLCanvasElement.toBlob` is the better-established path on iOS Safari. Placing the button in `ProfileScreen` rather than on a new screen keeps `App.tsx` untouched and the visit short (PRD NFR "Czas w aplikacji").

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | A1 karta-postepu: share the Progress Card | 1-3 | — | yes | in-progress | — |

## Critical Implementation Details
- **Share must start inside the tap.** `navigator.share` requires transient user activation and Safari is strict about it. The canvas draw is synchronous and `toBlob` is the only await; call `share` straight after it in the click handler, with no other awaits (no store reads) before it.
- **Feature detection order:** `typeof navigator.share === 'function'` and `navigator.canShare?.({ files: [file] })` → share; else download. `AbortError` from `share` means the user cancelled → silent; any other error → download fallback.
- **Download fallback:** `URL.createObjectURL(blob)`, a temporary `<a href download="karta-postepu.png">` appended, clicked and removed; revoke the URL afterwards (after a tick, so the download starts).
- **Fonts and emoji offline:** draw with the system font stack (`system-ui, sans-serif`) and the instrument emoji; no web fonts are fetched.
- **Polish plural:** 1 → "dzień z muzyką", otherwise "dni z muzyką" ("2 dni", "5 dni"); the button is hidden at 0, so the card never says 0.
- **Busy state:** disable the button while generating to avoid two share sheets; show a short Polish status only when the fallback downloaded the image ("Obrazek zapisany.").

## Phase 1: Card model and Polish copy
### Overview
A pure, fully unit-tested description of what the card shows.

### Required changes
#### 1. Copy
- **File**: `src/progress-card/copy.ts`
- **Goal**: all Polish strings of the feature in one place, encouraging tone, readable for children.
- **Contract**: `SHARE_BUTTON` ("Pokaż rodzinie"), `CARD_TITLE` ("Grajek"), `musicDaysHeadline(count)` → "1 dzień z muzyką w tym tygodniu" / "N dni z muzyką w tym tygodniu", `CARD_CHEER` (e.g. "Ćwiczę dla siebie!"), `SHARE_TITLE` / `SHARE_TEXT` for the share sheet, `DOWNLOADED_MESSAGE` ("Obrazek zapisany."), `SHARE_FAILED_MESSAGE` (reuses `RETRY_MESSAGE` from `src/profile/copy.ts`), `CARD_FILE_NAME` = `karta-postepu.png`.

#### 2. Card model
- **File**: `src/progress-card/cardModel.ts` (+ `src/progress-card/cardModel.test.ts`)
- **Goal**: turn the home screen's data into the card's content, with the privacy rule enforced by construction (the input type has no name field).
- **Contract**: `buildCardModel({ days: string[]; musicDays: ReadonlySet<string>; instrumentName: string }): CardModel` where `CardModel = { title; instrumentIcon; instrumentName; headline; week: { short: string; music: boolean }[] (7, Monday first); cheer; musicDayCount }`. Uses `instrumentIcon` and `WEEKDAY_LABELS`; counts only music days that fall inside `days`.

### Success criteria
#### Automated
- `pnpm test src/progress-card/cardModel.test.ts` passes: headline plural for 1, 2, 4, 5, 7 days; week row of 7 Monday-first entries marks exactly the music days; music days outside the week are not counted; preset and "Inny" instruments get the right icon.
- A test asserts the model contains no profile name (the builder's input type has no name, and the serialized model built for a profile named "Ola" does not contain "Ola").
- `pnpm typecheck` and `pnpm lint` pass.
#### Manual
- (none)

## Phase 2: Canvas renderer and share service
### Overview
Draw the model to a PNG and hand it to the system share sheet, or download it.

### Required changes
#### 1. Renderer
- **File**: `src/progress-card/renderCard.ts` (+ `src/progress-card/renderCard.test.ts`)
- **Goal**: draw a 1080x1080 card in the app's colours (`#1e3a8a` background, amber music days, neutral empty days, large text) using only Canvas 2D.
- **Contract**: `drawCard(ctx: CanvasRenderingContext2D, model: CardModel): void` (pure drawing, testable with a fake context) and `renderCardPng(model: CardModel, createCanvas?: () => HTMLCanvasElement): Promise<Blob>` (creates the canvas, sets its size, draws, resolves `toBlob('image/png')`, rejects when the context or the blob is null). `CARD_SIZE = 1080`.

#### 2. Share service
- **File**: `src/progress-card/shareCard.ts` (+ `src/progress-card/shareCard.test.ts`)
- **Goal**: share the PNG as a file when supported, otherwise download it.
- **Contract**: `shareCardImage(blob: Blob, deps?: { navigator?: { share?, canShare? }; download?: (blob: Blob, fileName: string) => void }): Promise<'shared' | 'cancelled' | 'downloaded'>`; `downloadBlob(blob, fileName)` is the default download via an object URL and `<a download>`.

### Success criteria
#### Automated
- `pnpm test src/progress-card/renderCard.test.ts` passes: with a fake 2D context, `drawCard` writes the headline, instrument name and title via `fillText`, draws 7 day cells and never writes a profile name; `renderCardPng` resolves the blob from an injected canvas and rejects when `getContext` returns null.
- `pnpm test src/progress-card/shareCard.test.ts` passes: shares a `File` named `karta-postepu.png` of type `image/png` when `canShare` is true (`'shared'`); returns `'cancelled'` without downloading on `AbortError`; downloads when `share`/`canShare` is missing, `canShare` returns false, or `share` rejects with another error (`'downloaded'`).
- `pnpm typecheck` and `pnpm lint` pass.
#### Manual
- (none)

## Phase 3: Share button on the home screen
### Overview
Wire the feature into the existing home screen without touching `App.tsx`.

### Required changes
#### 1. Button component
- **File**: `src/progress-card/ShareCardButton.tsx` (+ `src/progress-card/ShareCardButton.test.tsx`), `src/progress-card/index.ts`
- **Goal**: a large, child-friendly secondary button that builds the model, renders the PNG and shares it; disabled while busy; shows `DOWNLOADED_MESSAGE` after a download fallback and `SHARE_FAILED_MESSAGE` if rendering fails.
- **Contract**: `<ShareCardButton days musicDays instrumentName render? share? />` (render and share injectable for tests, defaulting to `renderCardPng` / `shareCardImage`); renders nothing when the week has no music day. `index.ts` exports `ShareCardButton`.

#### 2. Home screen placement
- **File**: `src/profile/ProfileScreen.tsx`
- **Goal**: show the button below `WeekView`, using data the component already holds.
- **Contract**: one import and one element `<ShareCardButton days={weekDays(now)} musicDays={musicDays} instrumentName={profile.instrument.name} />` after `WeekView` (`ProfileScreen.tsx:105`). No other change.

#### 3. End-to-end check
- **File**: `e2e/progress-card.spec.ts`
- **Goal**: prove the real PNG and both paths in Chromium, offline.
- **Contract**: create a profile and check the button is absent; log a practice; go offline; (a) with `navigator.share` / `canShare` stubbed via `addInitScript` to record the call, tapping the button passes one `image/png` File named `karta-postepu.png` whose decoded size is 1080x1080; (b) with `share` removed, tapping it triggers a download named `karta-postepu.png` and shows "Obrazek zapisany.".

### Success criteria
#### Automated
- `pnpm test` passes (full unit suite, including `ShareCardButton.test.tsx`: hidden with no music days; calls render then share with the week data; shows the download message on `'downloaded'`; shows the retry message when render rejects; disabled while busy).
- `pnpm test:e2e e2e/progress-card.spec.ts` passes on `mobile-chromium`.
- `pnpm build`, `pnpm typecheck` and `pnpm lint` pass.
- `git diff e4e6ed3 -- src/App.tsx src/storage package.json pnpm-lock.yaml` is empty (no App.tsx edit, no migration, no new dependency).
#### Manual
- On an Android phone and an iPhone (installed PWA, airplane mode), tapping the button opens the system share sheet with the card image, and sending it to a messenger delivers the picture.
- The card is legible for a 7-year-old (large text, clear music-day highlights) and shows no name.

## Testing Strategy
- Vitest + Testing Library (jsdom): model and copy fully; the renderer through a fake `CanvasRenderingContext2D` and an injected canvas; the share service through an injected `navigator` and `download`; the component with injected render/share.
- Playwright (`mobile-chromium`, offline): real canvas PNG, stubbed share sheet, real download fallback.
- Manual: real share sheets on Android and iOS (only a human can see them).

## Performance Notes
One 1080x1080 canvas draw and PNG encode per tap (tens of milliseconds on a phone); nothing runs on page load.

## Migration Notes
None. Read-only use of the existing `practices` store via `PracticeStore.listWeek`.

## References
- Roadmap slice S-06: `context/foundation/roadmap.md`
- PRD FR-008, FR-001 challenge, NFR Offline / Prywatność / Czytelność: `context/prd/prd.md:65-90`, `context/prd/prd.md:100-108`
- `src/profile/ProfileScreen.tsx`, `src/practice/practiceStore.ts`, `src/practice/week.ts`, `src/profile/instruments.ts`
- Prior change: `context/archive/2026-10-11-zapis-cwiczenia/`

## Progress

### Phase 1: Card model and Polish copy
#### Automated
- [ ] 1.1 `pnpm test src/progress-card/cardModel.test.ts` passes: headline plural for 1, 2, 4, 5, 7 days; week row of 7 Monday-first entries marks exactly the music days; music days outside the week are not counted; preset and "Inny" instruments get the right icon.
- [ ] 1.2 A test asserts the model contains no profile name (the builder's input type has no name, and the serialized model built for a profile named "Ola" does not contain "Ola").
- [ ] 1.3 `pnpm typecheck` and `pnpm lint` pass.
#### Manual

### Phase 2: Canvas renderer and share service
#### Automated
- [ ] 2.1 `pnpm test src/progress-card/renderCard.test.ts` passes: with a fake 2D context, `drawCard` writes the headline, instrument name and title via `fillText`, draws 7 day cells and never writes a profile name; `renderCardPng` resolves the blob from an injected canvas and rejects when `getContext` returns null.
- [ ] 2.2 `pnpm test src/progress-card/shareCard.test.ts` passes: shares a `File` named `karta-postepu.png` of type `image/png` when `canShare` is true (`'shared'`); returns `'cancelled'` without downloading on `AbortError`; downloads when `share`/`canShare` is missing, `canShare` returns false, or `share` rejects with another error (`'downloaded'`).
- [ ] 2.3 `pnpm typecheck` and `pnpm lint` pass.
#### Manual

### Phase 3: Share button on the home screen
#### Automated
- [ ] 3.1 `pnpm test` passes (full unit suite, including `ShareCardButton.test.tsx`: hidden with no music days; calls render then share with the week data; shows the download message on `'downloaded'`; shows the retry message when render rejects; disabled while busy).
- [ ] 3.2 `pnpm test:e2e e2e/progress-card.spec.ts` passes on `mobile-chromium`.
- [ ] 3.3 `pnpm build`, `pnpm typecheck` and `pnpm lint` pass.
- [ ] 3.4 `git diff e4e6ed3 -- src/App.tsx src/storage package.json pnpm-lock.yaml` is empty (no App.tsx edit, no migration, no new dependency).
#### Manual
- [ ] 3.5 On an Android phone and an iPhone (installed PWA, airplane mode), tapping the button opens the system share sheet with the card image, and sending it to a messenger delivers the picture.
- [ ] 3.6 The card is legible for a 7-year-old (large text, clear music-day highlights) and shows no name.
