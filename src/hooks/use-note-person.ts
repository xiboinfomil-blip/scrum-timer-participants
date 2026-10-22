'use client';

import { useEffect, useState } from 'react';

// Persist only the selection, never a capability token or note text.
export function useNotePerson(teamId?: string) {
  const [state, setState] = useState<{ teamId?: string; id: string | null }>({ id: null });
  useEffect(() => {
    const timer = window.setTimeout(() => {
      let id: string | null = null;
      if (teamId) {
        try {
          const stored = localStorage.getItem(`portal-note-person:${teamId}`);
          if (stored && stored.length <= 100) id = stored;
        } catch { /* Selection still works when storage is blocked. */ }
      }
      setState({ teamId, id });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [teamId]);
  function choose(id: string) {
    setState({ teamId, id });
    if (teamId) {
      try { localStorage.setItem(`portal-note-person:${teamId}`, id); }
      catch { /* Session-only fallback. */ }
    }
  }
  return { personId: state.teamId === teamId ? state.id : null, ready: !!teamId && state.teamId === teamId, choose };
}