import { useEffect, useState } from 'react';

/**
 * Run an async loader whenever `key` changes. Returns undefined while loading
 * (and while a stale key's result is still in flight), so callers never see data for another key.
 * A loader that fails is thrown into the render, where the app's error boundary shows a friendly message.
 */
export function useAsync<T>(load: () => Promise<T>, key: string): T | undefined {
  const [done, setDone] = useState<{ key: string; value: T } | null>(null);
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  useEffect(() => {
    let live = true;
    load().then(
      (value) => live && setDone({ key, value }),
      (error: unknown) => live && setFailure({ error }),
    );
    return () => {
      live = false;
    };
    // `load` is a fresh closure every render; `key` names what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (failure) throw failure.error;
  return done?.key === key ? done.value : undefined;
}
