import type { CustomGameTheme } from '@/types';

const STORAGE_KEY = 'moonshot_custom_games';

export function listCustomGames(): CustomGameTheme[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getCustomGame(id: string): CustomGameTheme | null {
  return listCustomGames().find((g) => g.id === id) ?? null;
}

export function saveCustomGame(theme: CustomGameTheme): void {
  const games = listCustomGames();
  const idx = games.findIndex((g) => g.id === theme.id);
  if (idx >= 0) {
    games[idx] = theme;
  } else {
    games.push(theme);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

export function deleteCustomGame(id: string): void {
  const games = listCustomGames().filter((g) => g.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}
