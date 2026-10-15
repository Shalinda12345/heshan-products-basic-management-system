'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, inputClass } from '@/app/components/ui/form';
import { Notice } from '@/app/components/ui/feedback';
import { apiSend, errorMessage } from '@/app/lib/api-client';
import { logout } from '@/app/login/logout';

export default function ChangePasswordForm({ required, homePath, minLength }: { required: boolean; homePath: string; minLength: number }) {
    const router = useRouter();
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const mismatch = confirm.length > 0 && next !== confirm;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (next !== confirm) {
            setError('The new passwords do not match.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await apiSend('/api/account/password', 'POST', { current_password: current, new_password: next });
            setCurrent('');
            setNext('');
            setConfirm('');
            setDone(true);
            if (required) {
                // The session now allows everything else: continue to the user's start page
                router.replace(homePath);
            }
            router.refresh();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4" aria-label="Change password">
            {required && !done && (
                <Notice tone="warning" title="A new password is required">
                    Enter the temporary password you were given, then choose your own.
                </Notice>
            )}
            {done && <Notice tone="success" title="Password changed">Your other devices have been signed out.</Notice>}
            {error && <Notice tone="error">{error}</Notice>}

            <Field label={required ? 'Temporary password' : 'Current password'}>
                {(id) => <input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} required />}
            </Field>
            <Field label="New password">
                {(id) => <input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} required minLength={minLength} />}
            </Field>
            <Field label="Confirm new password" error={mismatch ? 'Does not match the new password.' : null}>
                {(id) => <input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} required />}
            </Field>

            <div className="pt-2">
                <Button type="submit" busy={busy} disabled={!current || !next || mismatch}>Change password</Button>
            </div>
        </form>
    );
}

// Lets someone who can't change the password now leave without reaching anything else
export function SignOutInstead() {
    return (
        <form action={logout} className="mt-4">
            <button type="submit" className="text-sm font-semibold text-slate-400 hover:text-slate-200 cursor-pointer">
                Sign out instead
            </button>
        </form>
    );
}
