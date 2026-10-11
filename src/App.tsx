export const GREETING = 'Cześć! Tu zapiszesz swoje ćwiczenia na instrumencie.';

export function App() {
  return (
    <main
      className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        className="h-28 w-28 text-amber-300"
        fill="currentColor"
      >
        <path d="M44 6v34.5A9 9 0 1 1 38 32V16L24 19v25.5A9 9 0 1 1 18 36V12z" />
      </svg>
      <h1 className="text-6xl font-extrabold tracking-tight">Grajek</h1>
      <p className="max-w-xs text-2xl leading-snug font-medium">{GREETING}</p>
    </main>
  );
}
