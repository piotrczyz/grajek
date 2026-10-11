import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDb } from '../storage/index.ts';
import {
  createIndexedDbProfileStore,
  MAX_INSTRUMENTS,
  NAME_MAX_LENGTH,
  ProfileError,
  validateInstrumentName,
  validateProfileInput,
} from './profileStore.ts';

let counter = 0;
const uniqueName = () => `grajek-profile-test-${Date.now()}-${(counter += 1)}`;
const storeOn = (name: string) => createIndexedDbProfileStore(() => openDb({ name }));

describe('validateProfileInput', () => {
  it('trims the name and the instrument', () => {
    expect(validateProfileInput({ name: '  Ola ', instrumentName: ' Gitara  ' })).toEqual({
      ok: true,
      value: { name: 'Ola', instrumentName: 'Gitara' },
    });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(validateProfileInput({ name: '   ', instrumentName: 'Flet' })).toEqual({
      ok: false,
      reason: 'name-empty',
    });
  });

  it('accepts a name of the maximum length and rejects a longer one', () => {
    const max = 'a'.repeat(NAME_MAX_LENGTH);
    expect(validateProfileInput({ name: ` ${max} `, instrumentName: 'Flet' }).ok).toBe(true);
    expect(validateProfileInput({ name: `${max}a`, instrumentName: 'Flet' })).toEqual({
      ok: false,
      reason: 'name-too-long',
    });
  });

  it('requires an instrument of 1-24 characters', () => {
    expect(validateProfileInput({ name: 'Ola', instrumentName: '  ' })).toEqual({
      ok: false,
      reason: 'instrument-empty',
    });
    expect(
      validateProfileInput({ name: 'Ola', instrumentName: 'b'.repeat(NAME_MAX_LENGTH + 1) }),
    ).toEqual({ ok: false, reason: 'instrument-too-long' });
  });
});

describe('IndexedDB profile store', () => {
  it('loads null on an empty database', async () => {
    await expect(storeOn(uniqueName()).load()).resolves.toBeNull();
  });

  it('creates a profile with one instrument and loads it back', async () => {
    const store = storeOn(uniqueName());
    const created = await store.create({ name: ' Ola ', instrumentName: ' Skrzypce ' });

    expect(created.name).toBe('Ola');
    expect(created.instrument.name).toBe('Skrzypce');
    expect(created.instrument.id).toMatch(/\S/);
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
    await expect(store.load()).resolves.toEqual(created);
  });

  it('loads the saved profile through a fresh store on the same database (reopen)', async () => {
    const name = uniqueName();
    const created = await storeOn(name).create({ name: 'Kuba', instrumentName: 'Perkusja' });
    await expect(storeOn(name).load()).resolves.toEqual(created);
  });

  it('rejects invalid input without writing anything', async () => {
    const name = uniqueName();
    const store = storeOn(name);
    const error = await store.create({ name: '', instrumentName: 'Flet' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProfileError);
    expect(error).toMatchObject({ code: 'invalid', reason: 'name-empty' });
    await expect(store.load()).resolves.toBeNull();
  });

  it('refuses a second profile and keeps the first one and its single instrument', async () => {
    const name = uniqueName();
    const store = storeOn(name);
    const first = await store.create({ name: 'Ola', instrumentName: 'Pianino' });

    const error = await storeOn(name)
      .create({ name: 'Zosia', instrumentName: 'Flet' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProfileError);
    expect(error).toMatchObject({ code: 'exists' });

    await expect(store.load()).resolves.toEqual(first);
    // Atomicity: the refused create left no orphan instrument row behind.
    const db = await openDb({ name });
    expect(await db.count('instruments')).toBe(1);
    expect(await db.count('profile')).toBe(1);
    db.close();
  });

  it('creates exactly one profile when two creates race (StrictMode double mount)', async () => {
    const name = uniqueName();
    const results = await Promise.allSettled([
      storeOn(name).create({ name: 'Ola', instrumentName: 'Gitara' }),
      storeOn(name).create({ name: 'Ola', instrumentName: 'Gitara' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const db = await openDb({ name });
    expect(await db.count('instruments')).toBe(1);
    db.close();
  });

  it('retries opening the database after a failed open', async () => {
    const name = uniqueName();
    let attempts = 0;
    const store = createIndexedDbProfileStore(() => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error('blocked')) : openDb({ name });
    });
    await expect(store.load()).rejects.toThrow('blocked');
    await expect(store.load()).resolves.toBeNull();
  });
});

describe('validateInstrumentName', () => {
  const owned = [{ name: 'Gitara' }];

  it('trims a new name', () => {
    expect(validateInstrumentName('  Pianino ', owned)).toEqual({ ok: true, value: 'Pianino' });
  });

  it('rejects an empty, a too long and an already owned name (case-insensitive)', () => {
    expect(validateInstrumentName('  ', owned)).toEqual({ ok: false, reason: 'instrument-empty' });
    expect(validateInstrumentName('b'.repeat(NAME_MAX_LENGTH + 1), owned)).toEqual({
      ok: false,
      reason: 'instrument-too-long',
    });
    expect(validateInstrumentName(' gitara ', owned)).toEqual({ ok: false, reason: 'instrument-duplicate' });
  });

  it('rejects any name once the limit is reached', () => {
    const full = Array.from({ length: MAX_INSTRUMENTS }, (_, i) => ({ name: `I${i}` }));
    expect(validateInstrumentName('Flet', full)).toEqual({ ok: false, reason: 'instrument-limit' });
  });
});

describe('IndexedDB profile store: several instruments', () => {
  it('lists a new profile with its single instrument', async () => {
    const created = await storeOn(uniqueName()).create({ name: 'Ola', instrumentName: 'Gitara' });
    expect(created.instruments).toEqual([created.instrument]);
  });

  it('adds an instrument and loads every instrument oldest first', async () => {
    const store = storeOn(uniqueName());
    const created = await store.create({ name: 'Ola', instrumentName: 'Gitara' });
    const piano = await store.addInstrument('  Pianino ');
    const flute = await store.addInstrument('Flet');

    expect(piano).toMatchObject({ name: 'Pianino', id: expect.stringMatching(/\S/) });
    const loaded = await store.load();
    expect(loaded?.instrument).toEqual(created.instrument);
    expect(loaded?.instruments.map((i) => i.name)).toEqual(['Gitara', 'Pianino', 'Flet']);
    expect(loaded?.instruments[2]).toEqual(flute);
  });

  it('keeps added instruments across a fresh store on the same database', async () => {
    const name = uniqueName();
    await storeOn(name).create({ name: 'Kuba', instrumentName: 'Perkusja' });
    const added = await storeOn(name).addInstrument('Ukulele');
    const loaded = await storeOn(name).load();
    expect(loaded?.instruments.map((i) => i.id)).toContain(added.id);
    expect(loaded?.instruments).toHaveLength(2);
  });

  it.each([
    ['an empty name', '   ', 'instrument-empty'],
    ['a too long name', 'x'.repeat(NAME_MAX_LENGTH + 1), 'instrument-too-long'],
    ['a duplicate name', 'GITARA', 'instrument-duplicate'],
  ])('rejects %s without writing anything', async (_label, input, reason) => {
    const name = uniqueName();
    const store = storeOn(name);
    await store.create({ name: 'Ola', instrumentName: 'Gitara' });
    const error = await store.addInstrument(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProfileError);
    expect(error).toMatchObject({ code: 'invalid', reason });
    const db = await openDb({ name });
    expect(await db.count('instruments')).toBe(1);
    db.close();
  });

  it('rejects a new instrument once the limit is reached', async () => {
    const store = storeOn(uniqueName());
    await store.create({ name: 'Ola', instrumentName: 'I0' });
    for (let i = 1; i < MAX_INSTRUMENTS; i += 1) await store.addInstrument(`I${i}`);
    const error = await store.addInstrument('Flet').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'invalid', reason: 'instrument-limit' });
    expect((await store.load())?.instruments).toHaveLength(MAX_INSTRUMENTS);
  });

  it('rejects adding an instrument when no profile exists', async () => {
    const name = uniqueName();
    const error = await storeOn(name).addInstrument('Flet').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProfileError);
    expect(error).toMatchObject({ code: 'missing' });
    const db = await openDb({ name });
    expect(await db.count('instruments')).toBe(0);
    db.close();
  });

  it('adds only one of two racing adds of the same name', async () => {
    const name = uniqueName();
    await storeOn(name).create({ name: 'Ola', instrumentName: 'Gitara' });
    const results = await Promise.allSettled([
      storeOn(name).addInstrument('Flet'),
      storeOn(name).addInstrument('Flet'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await storeOn(name).load())?.instruments).toHaveLength(2);
  });
});
