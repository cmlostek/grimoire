import { useCallback, useEffect, useState } from 'react';

/**
 * Per-user sidebar customization — reorder + hide nav items, persisted to
 * localStorage. This is independent from the GM's campaign-wide page-visibility
 * setting (which gates what players are *allowed* to see). This decides how
 * each individual viewer arranges what's already available to them.
 *
 * Nav items are identified by their route path (`/notes`, `/items`, …). New
 * items the user has never seen appear at the end of the order automatically.
 */
const STORAGE_KEY = 'grimoire:nav-customization';

type Stored = {
  /** Ordered list of nav-item paths. May omit some — those use defaults. */
  order: string[];
  /** Paths the user has hidden. */
  hidden: string[];
};

function read(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { order: [], hidden: [] };
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      order: Array.isArray(parsed.order) ? parsed.order.filter((s) => typeof s === 'string') : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((s) => typeof s === 'string') : [],
    };
  } catch {
    return { order: [], hidden: [] };
  }
}

function write(s: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

export function useNavCustomization() {
  const [state, setState] = useState<Stored>(() => read());
  const [editing, setEditing] = useState(false);

  useEffect(() => { write(state); }, [state]);

  const setOrder = useCallback((next: string[]) => {
    setState((s) => ({ ...s, order: next }));
  }, []);

  const toggleHidden = useCallback((path: string) => {
    setState((s) => {
      const isHidden = s.hidden.includes(path);
      return {
        ...s,
        hidden: isHidden ? s.hidden.filter((p) => p !== path) : [...s.hidden, path],
      };
    });
  }, []);

  const reset = useCallback(() => {
    setState({ order: [], hidden: [] });
  }, []);

  /**
   * Apply the saved order + hidden set to a default nav list. Items the
   * user has reordered come first in their chosen order; anything new is
   * appended at the end. Hidden items are filtered out (unless `includeHidden`
   * is true, which the edit panel uses to render them with a toggle).
   */
  const apply = useCallback(
    <T extends { to: string }>(items: T[], opts?: { includeHidden?: boolean }): T[] => {
      const byPath = new Map<string, T>();
      for (const item of items) byPath.set(item.to, item);
      const ordered: T[] = [];
      const seen = new Set<string>();
      for (const path of state.order) {
        const item = byPath.get(path);
        if (item) {
          ordered.push(item);
          seen.add(path);
        }
      }
      for (const item of items) {
        if (!seen.has(item.to)) ordered.push(item);
      }
      if (opts?.includeHidden) return ordered;
      return ordered.filter((i) => !state.hidden.includes(i.to));
    },
    [state],
  );

  return {
    order: state.order,
    hidden: state.hidden,
    editing,
    setEditing,
    setOrder,
    toggleHidden,
    reset,
    apply,
    /** True if the path is currently hidden in the user's preferences. */
    isHidden: useCallback((path: string) => state.hidden.includes(path), [state.hidden]),
  };
}
