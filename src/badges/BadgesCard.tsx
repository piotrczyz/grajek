import { useEffect, useId, useRef, useState } from 'react';
import { createIndexedDbBadgeStore, type BadgeStore, type EarnedBadge } from './badgeStore.ts';
import { badgeById } from './catalog.ts';
import { COLLECTION_LABEL, COLLECTION_TOGGLE, DISMISS, NEW_BADGE, NEW_BADGES, retroSummary } from './copy.ts';

export interface BadgesCardProps {
  /** Number of sessions saved since the home screen mounted; a change means "a session was just saved". */
  savedCount: number;
  store?: BadgeStore;
  now?: () => Date;
}

type Message = { kind: 'summary'; count: number } | { kind: 'announcement'; badges: EarnedBadge[] };

const toggleButton = 'min-h-14 w-full rounded-2xl border-2 border-white/40 bg-white/10 px-6 text-2xl font-extrabold';
const dismissButton = 'min-h-14 rounded-2xl bg-amber-300 px-8 text-2xl font-extrabold text-blue-950';

/**
 * Odznaki za wysiłek on the home screen: the announcement right after a save,
 * the one-time summary for badges earned by earlier history, and the "Moje
 * odznaki" collection of earned badges only. Nothing hints at badges not
 * earned yet. Any storage failure hides the block; the next save tries again.
 */
export function BadgesCard({ savedCount, store: injected, now: injectedNow }: BadgesCardProps) {
  const [store] = useState(() => injected ?? createIndexedDbBadgeStore());
  const [now] = useState(() => injectedNow ?? (() => new Date()));
  const [earned, setEarned] = useState<EarnedBadge[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const firstSavedCount = useRef(savedCount);
  // Not a per-effect flag: under StrictMode the first mount effect is cleaned
  // up before its award resolves, and that award's badges must still be shown.
  const mounted = useRef(true);
  const collectionId = useId();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const afterSave = savedCount !== firstSavedCount.current;
    store
      .award(now())
      .then(async (fresh) => {
        const all = await store.list();
        if (!mounted.current) return;
        setFailed(false);
        setEarned(all);
        if (afterSave) {
          // A save replaces whatever was shown; with nothing new it shows nothing.
          setMessage(fresh.length > 0 ? { kind: 'announcement', badges: fresh } : null);
        } else if (fresh.length > 0) {
          setMessage({ kind: 'summary', count: fresh.length });
        }
      })
      .catch(() => {
        if (mounted.current) setFailed(true);
      });
  }, [savedCount, store, now]);

  if (failed) return null;

  return (
    <section className="flex w-full max-w-sm flex-col items-center gap-4">
      <div role="status" className="flex w-full flex-col items-center gap-3 empty:hidden">
        {message?.kind === 'summary' && (
          <p className="rounded-3xl border-2 border-amber-300 bg-white/10 px-5 py-4 text-2xl leading-snug font-bold">
            {retroSummary(message.count)}
          </p>
        )}
        {message?.kind === 'announcement' && <Announcement badges={message.badges} />}
      </div>
      {message && (
        <button type="button" onClick={() => setMessage(null)} className={dismissButton}>
          {DISMISS}
        </button>
      )}
      {earned.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={collectionId}
            onClick={() => setOpen((value) => !value)}
            className={toggleButton}
          >
            {COLLECTION_TOGGLE}
          </button>
          {open && (
            <ul id={collectionId} aria-label={COLLECTION_LABEL} className="flex w-full flex-col gap-3">
              {earned.map((badge) => (
                <BadgeItem key={badge.id} badge={badge} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Announcement({ badges }: { badges: readonly EarnedBadge[] }) {
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-3xl border-2 border-amber-300 bg-white/10 px-5 py-4">
      <p className="text-3xl font-extrabold text-amber-300">{badges.length === 1 ? NEW_BADGE : NEW_BADGES}</p>
      <ul className="flex w-full flex-col gap-4">
        {badges.map((badge) => {
          const definition = badgeById(badge.id);
          if (!definition) return null;
          return (
            <li key={badge.id} className="flex flex-col items-center gap-1">
              <span aria-hidden="true" className="text-7xl">
                {definition.icon}
              </span>
              <span className="text-2xl font-extrabold">{definition.name}</span>
              <span className="text-xl font-semibold">{definition.praise}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BadgeItem({ badge }: { badge: EarnedBadge }) {
  const definition = badgeById(badge.id);
  if (!definition) return null;
  return (
    <li className="flex items-center gap-4 rounded-2xl bg-white/10 px-4 py-3 text-left">
      <span aria-hidden="true" className="text-5xl">
        {definition.icon}
      </span>
      <span className="flex flex-col">
        <span className="text-xl font-extrabold">{definition.name}</span>
        <span className="text-lg">{definition.praise}</span>
      </span>
    </li>
  );
}
