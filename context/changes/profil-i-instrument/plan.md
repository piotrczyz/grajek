# Student profile with name and instrument — Implementation Plan

## Overview
Delivers roadmap slice S-01 (FR-001): on first launch the student creates one on-device Profile with a name or pseudonym and one instrument; the Profile is stored in IndexedDB through the F-01 storage contract and is shown again after the app is closed and reopened, online or offline. One Profile per device; adding further instruments is S-09 and stays out.

## Current State Analysis
- Storage contract exists: `openDb()` opens the `grajek` database at version `migrations.length` and runs only the new migrations (`src/storage/db.ts:21-33`); `options.name` / `options.migrations` are test-only overrides (`src/storage/db.ts:14-19`).
- The migration list is append-only and holds one empty v1 migration (`src/storage/migrations.ts:4-9`, `:19-22`); a migration receives `(db, tx)` (`src/storage/migrations.ts:13-16`).
- `src/storage/db.test.ts:57-63` asserts the shipped list has exactly one migration and creates no store; it must change when v2 is appended.
- The app is a single static welcome screen with no state (`src/App.tsx:1-29`); `main.tsx` renders `<App />` and never opens the database (`src/main.tsx:8-26`), so no shipped build depends on schema v1.
- Unit tests run in jsdom with Testing Library (`src/test/setup.ts`); `fake-indexeddb` is already a devDependency and used by `src/storage/db.test.ts:1`.
- E2E (`e2e/offline.spec.ts:3-24`) runs against `vite preview` in a fresh browser context and expects the h1 `Grajek` and the greeting text after an offline reload; a first launch will now show the create-profile screen, so that screen keeps both.
- Glossary: **Profil** is local-only, **Uczeń** is the term in code (`context/discovery/glossary.md`); NFR Prywatność: the name never leaves the device (`context/prd/prd.md:106`); NFR Czytelność: large touch targets, icons, little text, Polish (`context/prd/prd.md:105`).

## Desired End State
- First launch: a Polish screen with the Grajek heading, the greeting, a name/pseudonym field and a grid of large instrument buttons (with an "Inny" option that reveals a short text field); a "Gotowe" button saves.
- After saving, the screen shows the student's Profile ("Cześć, <name>!" and the chosen instrument).
- Closing and reopening the app (also offline) shows the saved Profile, never the create form again.
- The device holds at most one Profile; the data never leaves the device.

### Key discoveries
- Version equals list length, so S-01 appends exactly one migration (v2) (`src/storage/db.ts:27-31`).
- F-01 never opens the DB at runtime (`src/main.tsx:8-26`), so rolling back to the F-01 build cannot hit a version conflict.
- Existing App tests render synchronously (`src/App.test.tsx:6-17`); once App reads IndexedDB they must wait for the async load.

## What we're NOT doing
- No second instrument, instrument picker at logging, or per-instrument stats (S-09).
- No editing or deleting the Profile, no several Profiles per device (parked in roadmap).
- No Ćwiczenie, week view, goal or reminder (S-02, S-03, S-07).
- No network calls, sync, analytics or export.
- No router library; the App switches screens on Profile state.

## Implementation Approach
Migration v2 creates two stores: `profile` (out-of-line fixed key `current`, value `{ name, createdAt }`) and `instruments` (keyPath `id`, string id from `crypto.randomUUID()`, value `{ id, name, createdAt }`). The fixed key enforces one Profile per device; the separate instrument store gives S-02 a stable `instrumentId` to reference and lets S-09 add rows without a data migration (advisor consult). A small profile module wraps the database behind a `ProfileStore` interface (`load()` and `create(input)`), so the UI never touches IndexedDB directly and tests can inject a store backed by `fake-indexeddb` with a unique database name. `create` writes the profile and its single instrument in one readwrite transaction over both stores and refuses to overwrite an existing profile.

`App` gets an optional `store` prop (default: the IndexedDB-backed store) and three states: loading (renders an empty frame, so the form does not flash for a returning student), no profile (create screen), profile (profile screen). Instruments are a short preset list of labels with icons plus "Inny" free text, stored as the display label, because the PRD allows any instrument and children read icons more easily than they type.

Alternatives rejected: a single record with an `instrument` string (S-02/S-09 would need a data migration to introduce ids); a profile document with an `instruments` array (S-09 would read-modify-write the whole profile); `localStorage` (bypasses the F-01 storage contract).

## Increments
| # | Name | Phases | Depends on | User-visible | Status | PR |
|---|---|---|---|---|---|---|
| 1 | Student profile: storage, create and view screen | 1-3 | — | yes | in-progress | — |

## Critical Implementation Details
- **Migration**: append to `migrations` only; never edit v1. Add a one-line comment on v2 that the `instruments` store holds one row until S-09 and is referenced by S-02.
- **Validation**: name trimmed, 1-24 characters; instrument required (preset, or trimmed "Inny" text of 1-24 characters). "Gotowe" is disabled until both are valid. No uniqueness or profanity checks.
- **Load state**: while `load()` is pending render an empty `main` (no form) so a returning student never sees the form flash; a failed load or save shows one short encouraging retry message, never a crash.
- **Strict mode**: a double mount in StrictMode must not create two profiles (`create` refuses when a profile exists; loading has no side effects).
- **Touch targets**: instrument buttons and "Gotowe" at least 48px high, Tailwind classes consistent with `src/App.tsx`.

## Phase 1: Profile storage
### Overview
Schema v2 and the profile data module, fully unit-tested against `fake-indexeddb`.

### Required changes
#### 1. Migration v2
- **File**: `src/storage/migrations.ts`
- **Goal**: create the `profile` and `instruments` stores.
- **Contract**: `migrations.length === 2`; store `profile` without keyPath (record under key `current`); store `instruments` with `keyPath: 'id'`.

#### 2. Storage contract test update
- **File**: `src/storage/db.test.ts`
- **Goal**: replace the "exactly one empty migration" assertion with: the shipped list opens a fresh DB at version 2 with stores `instruments` and `profile`; a database at v1 upgrades to v2.
- **Contract**: test-only.

#### 3. Profile module
- **File**: `src/profile/profileStore.ts` (new), `src/profile/index.ts` (new)
- **Goal**: typed access to the Profile.
- **Contract**: types `Profile { name: string; instrument: Instrument; createdAt: string }`, `Instrument { id: string; name: string; createdAt: string }`, `NewProfile { name: string; instrumentName: string }`; interface `ProfileStore { load(): Promise<Profile | null>; create(input: NewProfile): Promise<Profile> }`; `createIndexedDbProfileStore(open?: () => Promise<IDBPDatabase<unknown>>): ProfileStore` (defaults to `openDb()`); `validateProfileInput(input)` returning the trimmed input or a reason. `create` rejects with a typed error when a profile already exists or the input is invalid; it writes both stores in one transaction.

#### 4. Profile module tests
- **File**: `src/profile/profileStore.test.ts` (new)
- **Goal**: cover load on an empty DB, create then load (also through a fresh store on the same DB name, simulating reopen), trimming and length validation, refusing a second profile, atomicity (no instrument row without a profile).

### Success criteria
#### Automated
- `pnpm test` passes, including the new profile store tests and the updated storage tests
- `pnpm typecheck` passes
- `pnpm lint` passes
#### Manual
- none

## Phase 2: Create and view profile screen
### Overview
The first-launch create screen and the profile screen, wired into `App`.

### Required changes
#### 1. Instrument presets
- **File**: `src/profile/instruments.ts` (new)
- **Goal**: the preset list shown as buttons.
- **Contract**: readonly list of `{ label: string; icon: string }` in Polish (Pianino, Gitara, Skrzypce, Flet, Perkusja, Ukulele, Wiolonczela, Trąbka); "Inny" is handled by the form, not the list.

#### 2. Create profile screen
- **File**: `src/profile/CreateProfileScreen.tsx` (new)
- **Goal**: name/pseudonym input (labelled e.g. "Jak masz na imię? Może być pseudonim."), instrument buttons as a single-choice group, "Inny" reveals a text input, "Gotowe" submits via `ProfileStore.create`.
- **Contract**: props `{ store: ProfileStore; onCreated(profile: Profile): void }`; keeps the h1 `Grajek` and the existing `GREETING` text above the form.

#### 3. Profile screen
- **File**: `src/profile/ProfileScreen.tsx` (new)
- **Goal**: shows "Cześć, <name>!" and the instrument (icon + label); no edit controls.
- **Contract**: props `{ profile: Profile }`.

#### 4. App wiring
- **File**: `src/App.tsx`
- **Goal**: load the Profile on mount and switch between loading, create and profile screens.
- **Contract**: `App({ store?: ProfileStore })`, default `createIndexedDbProfileStore()`; `GREETING` stays exported.

#### 5. App tests
- **File**: `src/App.test.tsx`
- **Goal**: inject a store on a unique `fake-indexeddb` database; cover: first launch shows heading, greeting and form; "Gotowe" disabled until name and instrument are chosen; creating with a preset shows the profile screen; "Inny" with typed text saves that label; rendering a fresh `App` on the same database shows the profile screen, not the form; a rejected save shows the retry message.

### Success criteria
#### Automated
- `pnpm test` passes, including the new App flow tests
- `pnpm typecheck` passes
- `pnpm lint` passes
- `pnpm build` succeeds
#### Manual
- On a phone-sized viewport the create screen fits without horizontal scrolling and instrument buttons are easy to tap

## Phase 3: Persistence end to end
### Overview
Prove in a real browser that the Profile survives a reload, online and offline.

### Required changes
#### 1. Profile E2E spec
- **File**: `e2e/profile.spec.ts` (new)
- **Goal**: fill the name, pick an instrument, tap "Gotowe", see the profile screen; reload and see the same profile; once the service worker controls the page (as in `e2e/offline.spec.ts`), go offline and reload, the profile is still shown.
- **Contract**: test-only; `e2e/offline.spec.ts` keeps passing unchanged because the first-launch screen still shows the heading and the greeting.

### Success criteria
#### Automated
- `pnpm test:e2e` passes, including `e2e/profile.spec.ts` and the unchanged `e2e/offline.spec.ts`
#### Manual
- On a real phone with the installed app: create a Profile, close the app fully, reopen it, the Profile is shown

## Testing Strategy
- Unit (Vitest + `fake-indexeddb`): migration v2, profile store behaviour, validation, reopen through a fresh store on the same database name.
- Component (Testing Library): App screen states and the create flow with an injected store.
- E2E (Playwright, mobile Chromium against `vite preview`): reload and offline reload keep the Profile.

## Migration Notes
- v2 is additive: two new empty stores, no change to existing data (v1 is empty).
- Rollback: redeploying the F-01 build is safe because it never opens the database (`src/main.tsx:8-26`); the v2 stores and the saved Profile stay on the device untouched and are used again when S-01 is redeployed. Later builds must never remove or edit migration v2.
- F-02 runs in parallel; if it also appends a migration, whichever merges second rebases and appends after the other, never editing a merged one.

## References
- Roadmap slice S-01: `context/foundation/roadmap.md` (Slices, S-01)
- PRD FR-001 and NFRs: `context/prd/prd.md:65-67`, `:102-108`
- Glossary: `context/discovery/glossary.md`
- F-01 storage contract: `src/storage/db.ts`, `src/storage/migrations.ts`; F-01 change: `context/changes/szkielet-aplikacji-offline/`
- Tech stack: `context/foundation/tech-stack.md`

## Progress

### Phase 1: Profile storage
#### Automated
- [x] 1.1 `pnpm test` passes, including the new profile store tests and the updated storage tests
- [x] 1.2 `pnpm typecheck` passes
- [x] 1.3 `pnpm lint` passes

### Phase 2: Create and view profile screen
#### Automated
- [ ] 2.1 `pnpm test` passes, including the new App flow tests
- [ ] 2.2 `pnpm typecheck` passes
- [ ] 2.3 `pnpm lint` passes
- [ ] 2.4 `pnpm build` succeeds
#### Manual
- [ ] 2.5 On a phone-sized viewport the create screen fits without horizontal scrolling and instrument buttons are easy to tap

### Phase 3: Persistence end to end
#### Automated
- [ ] 3.1 `pnpm test:e2e` passes, including `e2e/profile.spec.ts` and the unchanged `e2e/offline.spec.ts`
#### Manual
- [ ] 3.2 On a real phone with the installed app: create a Profile, close the app fully, reopen it, the Profile is shown
