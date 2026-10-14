'use client';

import { useEffect, useRef } from 'react';
import { BACKGROUND_REQUEST_HEADER } from './session';

// fetch() for automatic refreshes: no caching, and flagged so the proxy doesn't count it as user activity
export function backgroundFetch(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, {
        ...init,
        cache: 'no-store',
        headers: { ...(init.headers as Record<string, string> | undefined), [BACKGROUND_REQUEST_HEADER]: '1' },
    });
}

// Calls `refresh` every `intervalMs` while the tab is visible, and right away when the user comes back
// to the tab. A refresh never starts while the previous one is still running.
export function useLiveRefresh(refresh: () => Promise<unknown> | void, intervalMs: number, enabled = true) {
    const refreshRef = useRef(refresh);
    const runningRef = useRef(false);

    useEffect(() => {
        refreshRef.current = refresh;
    }, [refresh]);

    useEffect(() => {
        if (!enabled) return;

        const tick = async () => {
            if (runningRef.current || document.visibilityState !== 'visible') return;
            runningRef.current = true;
            try {
                await refreshRef.current();
            } catch {
                // Network hiccup: the next tick tries again
            } finally {
                runningRef.current = false;
            }
        };

        const interval = setInterval(tick, intervalMs);
        const onVisible = () => {
            if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [intervalMs, enabled]);
}
