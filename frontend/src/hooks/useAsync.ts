import { useCallback, useEffect, useState } from "react";
import { onDataChanged } from "@/lib/sync-bus";

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
}

export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, loading: true, error: null });

  const run = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: undefined, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Re-fetches on every data-change notification — from a mutation in this
  // same tab or, via BroadcastChannel, another tab — so every screen stays
  // current without needing to navigate away and back or reload.
  useEffect(() => {
    const cancel = run();
    const unsubscribe = onDataChanged(() => run());
    return () => {
      cancel();
      unsubscribe();
    };
  }, [run]);

  return { ...state, refetch: run };
}
