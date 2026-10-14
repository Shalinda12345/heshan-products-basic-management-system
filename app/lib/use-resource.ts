'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, errorMessage } from './api-client';

// Loads JSON from `url` (null = don't load) and reloads it when the URL changes or reload() is called.
// While a new load runs, the previous data stays on screen (pages dim it rather than flashing a skeleton).
export function useResource<T>(url: string | null) {
    const [tick, setTick] = useState(0);
    const key = url ? `${url}#${tick}` : null;
    const [result, setResult] = useState<{ key: string | null; data: T | null; error: string | null }>({
        key: null,
        data: null,
        error: null,
    });

    useEffect(() => {
        if (!url || !key) return;
        const controller = new AbortController();
        apiGet<T>(url, { signal: controller.signal })
            .then((data) => setResult({ key, data, error: null }))
            .catch((error) => {
                if (controller.signal.aborted) return;
                setResult((previous) => ({ key, data: previous.data, error: errorMessage(error) }));
            });
        return () => controller.abort();
    }, [url, key]);

    const reload = useCallback(() => setTick((t) => t + 1), []);

    return {
        data: result.data,
        error: result.key === key ? result.error : null,
        // True until the current URL has answered (also while reloading)
        loading: key !== null && result.key !== key,
        reload,
    };
}
