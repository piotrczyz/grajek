/**
 * The catalog of Odznaki za wysiłek (S-05, ADR 0002): the single source of
 * every badge, its rule threshold, name, icon and praise line.
 *
 * Badges reward effort and persistence only: total practice time, Dni z
 * muzyką, reached goal weeks, and coming back after a break. Nothing here is
 * ever shown before it is earned (no list of badges to collect). Each badge is
 * earned at most once. The order below is the display order.
 */

export type BadgeId =
  | 'days-1'
  | 'days-10'
  | 'days-30'
  | 'days-100'
  | 'time-1h'
  | 'time-5h'
  | 'time-10h'
  | 'time-25h'
  | 'time-50h'
  | 'time-100h'
  | 'weeks-1'
  | 'weeks-5'
  | 'weeks-10'
  | 'weeks-25'
  | 'comeback';

export type BadgeKind = 'days' | 'time' | 'weeks' | 'comeback';

export interface BadgeDefinition {
  id: BadgeId;
  kind: BadgeKind;
  /**
   * `days`: distinct Dni z muzyką; `time`: total minutes; `weeks`: reached goal
   * weeks; `comeback`: calendar-day difference between two consecutive music days.
   */
  threshold: number;
  name: string;
  icon: string;
  /** One sentence praising effort and persistence. */
  praise: string;
}

export const BADGES: readonly BadgeDefinition[] = [
  {
    id: 'days-1',
    kind: 'days',
    threshold: 1,
    name: 'Pierwszy dzień z muzyką',
    icon: '🌱',
    praise: 'Pierwszy krok zrobiony, tak trzymaj!',
  },
  {
    id: 'days-10',
    kind: 'days',
    threshold: 10,
    name: '10 dni z muzyką',
    icon: '🎵',
    praise: 'Ćwiczysz regularnie, to się liczy!',
  },
  {
    id: 'days-30',
    kind: 'days',
    threshold: 30,
    name: '30 dni z muzyką',
    icon: '🎶',
    praise: 'Muzyka jest już częścią Twoich dni!',
  },
  {
    id: 'days-100',
    kind: 'days',
    threshold: 100,
    name: '100 dni z muzyką',
    icon: '🌳',
    praise: 'Sto dni grania, to wielka wytrwałość!',
  },
  {
    id: 'time-1h',
    kind: 'time',
    threshold: 60,
    name: 'Pierwsza godzina z muzyką',
    icon: '⏱️',
    praise: 'Cała godzina ćwiczeń, brawo za cierpliwość!',
  },
  {
    id: 'time-5h',
    kind: 'time',
    threshold: 300,
    name: 'Pięć godzin z muzyką',
    icon: '🔥',
    praise: 'Pięć godzin ćwiczeń, widać Twoją pracę!',
  },
  {
    id: 'time-10h',
    kind: 'time',
    threshold: 600,
    name: 'Dziesięć godzin z muzyką',
    icon: '💪',
    praise: 'Dziesięć godzin grania, to dużo wytrwałości!',
  },
  {
    id: 'time-25h',
    kind: 'time',
    threshold: 1500,
    name: '25 godzin z muzyką',
    icon: '🚀',
    praise: 'Ćwiczysz wytrwale, każda minuta się liczy!',
  },
  {
    id: 'time-50h',
    kind: 'time',
    threshold: 3000,
    name: '50 godzin z muzyką',
    icon: '⛰️',
    praise: 'Pięćdziesiąt godzin pracy z instrumentem, wspaniale!',
  },
  {
    id: 'time-100h',
    kind: 'time',
    threshold: 6000,
    name: '100 godzin z muzyką',
    icon: '🏔️',
    praise: 'Sto godzin ćwiczeń, to ogromna wytrwałość!',
  },
  {
    id: 'weeks-1',
    kind: 'weeks',
    threshold: 1,
    name: 'Pierwszy cel tygodnia',
    icon: '🎯',
    praise: 'Plan na tydzień zrealizowany, super robota!',
  },
  {
    id: 'weeks-5',
    kind: 'weeks',
    threshold: 5,
    name: '5 tygodni z celem',
    icon: '📅',
    praise: 'Pięć tygodni z celem, ćwiczysz systematycznie!',
  },
  {
    id: 'weeks-10',
    kind: 'weeks',
    threshold: 10,
    name: '10 tygodni z celem',
    icon: '🗓️',
    praise: 'Dziesięć tygodni z celem, to prawdziwa wytrwałość!',
  },
  {
    id: 'weeks-25',
    kind: 'weeks',
    threshold: 25,
    name: '25 tygodni z celem',
    icon: '🌟',
    praise: 'Ćwiczysz tydzień po tygodniu, wspaniała praca!',
  },
  {
    id: 'comeback',
    kind: 'comeback',
    threshold: 8,
    name: 'Powrót do muzyki',
    icon: '🌈',
    praise: 'Znowu grasz, super, że jesteś!',
  },
];

export function badgeById(id: string): BadgeDefinition | undefined {
  return BADGES.find((badge) => badge.id === id);
}
