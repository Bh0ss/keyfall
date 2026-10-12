import { useEffect, useState } from 'react';

/**
 * Run an async loader whenever `key` changes. Returns undefined while loading
 * (and while a stale key's result is still in flight), so callers never see data for another key.
 */
export function useAsync<T>(load: () => Promise<T>, key: string): T | undefined {
  const [done, setDone] = useState<{ key: string; value: T } | null>(null);
  useEffect(() => {
    let live = true;
    load().then(
      (value) => live && setDone({ key, value }),
      () => undefined,
    );
    return () => {
      live = false;
    };
    // `load` is a fresh closure every render; `key` names what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return done?.key === key ? done.value : undefined;
}
