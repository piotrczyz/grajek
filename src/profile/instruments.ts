/** Instruments offered as large buttons on the create-profile screen. "Inny" (free text) is handled by the form. */
export interface InstrumentPreset {
  label: string;
  icon: string;
}

export const INSTRUMENT_PRESETS: readonly InstrumentPreset[] = [
  { label: 'Pianino', icon: '🎹' },
  { label: 'Gitara', icon: '🎸' },
  { label: 'Skrzypce', icon: '🎻' },
  { label: 'Flet', icon: '🪈' },
  { label: 'Perkusja', icon: '🥁' },
  { label: 'Ukulele', icon: '🪕' },
  { label: 'Wiolonczela', icon: '🎻' },
  { label: 'Trąbka', icon: '🎺' },
];

/** Icon for an "Inny" (free text) instrument. */
export const OTHER_INSTRUMENT_ICON = '🎵';

export function instrumentIcon(name: string): string {
  return INSTRUMENT_PRESETS.find((preset) => preset.label === name)?.icon ?? OTHER_INSTRUMENT_ICON;
}
