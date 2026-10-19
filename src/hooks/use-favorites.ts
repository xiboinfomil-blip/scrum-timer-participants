'use client';
import { useEffect, useState } from 'react';

export function useFavorites(teamId?: string) {
  const [state, setState] = useState<{ teamId?: string; ids: string[] }>({ ids: [] });
  useEffect(() => {
    const timer = setTimeout(() => {
      let ids: string[] = [];
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(`portal-favorites:${teamId}`) || '[]');
        if (Array.isArray(stored)) ids = stored.filter((id): id is string => typeof id === 'string' && id.length <= 100).slice(0, 100);
      } catch { /* Storage is optional; favorites still work for this session. */ }
      setState({ teamId, ids });
    }, 0);
    return () => clearTimeout(timer);
  }, [teamId]);
  const favorites = state.teamId === teamId ? state.ids : [];
  function toggle(id: string) {
    const ids = favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id];
    setState({ teamId, ids });
    if (teamId) try { localStorage.setItem(`portal-favorites:${teamId}`, JSON.stringify(ids)); } catch { /* Session-only fallback. */ }
  }
  return { favorites, toggle };
}