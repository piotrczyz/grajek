---
change_id: cwiczenie-wstecz
title: Students can log a practice session up to 3 days back
status: impl_reviewed
created: 2026-10-12
updated: 2026-10-12
---

## Notes

https://github.com/piotrczyz/grajek/issues/17

<!-- rs-feature · track: feature · client: piotr@rocksoft.pl · repository: grajek -->

## Summary

A student who forgot to log practice, or did not have the phone at hand, can still log it afterwards, up to 3 days back. Today a session is always saved for today, so a missed day stays empty for good, which is demotivating and against the app's "reward effort" principle.

## Problem & context

- **Who:** students 7-13 (and parents helping them) who practised but did not log it the same day.
- **Current system:** `practiceStore.add` stamps `day` with the local date at save time; the "Ile grałeś?" panel (`LogPractice`) has no day choice; `WeekView` days are display-only.

## Scope

### In scope

1. In the "Ile grałeś?" panel, above the durations, a row of day chips: **Dziś** (preselected) · **Wczoraj** · **Przedwczoraj** · the weekday name of 3 days ago (e.g. "Czw").
2. In "Ten tydzień", an empty circle of one of the last 3 days (not today) is tappable and opens the same panel with that day preselected.
3. Saving stores the session with the chosen day.
4. After save: "Super! Dopisane do <dzień>." and the day lights up in the week view.

### Out of scope (non-goals)

- Logging more than 3 days back — keeps it an honest "I forgot", not batch back-filling before a lesson.
- Future days.
- Editing or deleting existing sessions.

## Success criteria

- **Primary:** a student logs yesterday's practice in about the same time as today's.
- **Guardrails:** logging for today needs no extra tap (S-02, ~10 s); nothing ever leaves the device; empty days stay neutral (never red).

## Requirements

- FR-001: Student can log a session for today, yesterday, or up to 3 days back. Priority: must-have. Change: new
- FR-002: Student can open the log panel for a past day by tapping its empty circle in "Ten tydzień" (only the last 3 days). Priority: must-have. Change: new
- FR-003: Week view, month view, weekly goal and effort badges count a back-dated session on its chosen day, like any other. Priority: must-have. Change: modified
- FR-004: Student can still log today's session with the same taps as before. Priority: must-have. Change: preserved

## Acceptance criteria

### AC-01: Log for yesterday

- **Given** no session yesterday
- **When** the student opens "Zagrałem!", taps "Wczoraj", picks 15 min and saves
- **Then** yesterday is a Dzień z muzyką in "Ten tydzień" and the message says "Super! Dopisane do <weekday>."

### AC-02: Today unchanged

- **Given** the panel is opened from "Zagrałem!"
- **When** the student saves right away
- **Then** the session is saved for today, with no extra tap compared to before

### AC-03: Tap a past day in the week

- **Given** the day before yesterday is empty
- **When** the student taps its circle in "Ten tydzień"
- **Then** the log panel opens with that day preselected

### AC-04: Limits

- **Given** a day 4 or more days ago, or a future day
- **When** the student looks at the chips or taps that day's circle
- **Then** it is not offered / not tappable, and the store rejects such a `day` with `PracticeError`

### AC-05: Across week boundary

- **Given** today is Monday
- **When** the student logs for Saturday
- **Then** the session counts in last week's data (month view, badges), and the chips still show it

## Metadata

- Requested by Piotr Czyż in Telegram (KODA: Grajek), 2026-10-12.
- Track: feature. Suggested change ID: `cwiczenie-wstecz`.


