// Hidden route of the "Zagraj i sprawdź" spike. This file is part of the main
// entry chunk, so it must stay tiny and import nothing.

/** True only when the query string carries `spike=nuty`. */
export function isSpikeRoute(search: string): boolean {
  return new URLSearchParams(search).get('spike') === 'nuty';
}
