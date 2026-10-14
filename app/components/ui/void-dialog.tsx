'use client';

import { useState } from 'react';
import Modal from './modal';
import { Button, Field, inputClass } from './form';
import { Notice } from './feedback';
import { apiSend, errorMessage } from '@/app/lib/api-client';

// Asks for the reason and voids a document (invoice, expense or return) through its /void endpoint
export default function VoidDialog({ open, title, url, effect, onClose, onVoided }: {
    open: boolean;
    title: string;
    url: string;
    // What voiding will do, shown before the user confirms
    effect: React.ReactNode;
    onClose: () => void;
    onVoided: (message: string) => void;
}) {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const close = () => {
        setReason('');
        setError(null);
        onClose();
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const result = await apiSend<{ message?: string }>(url, 'POST', { reason });
            setReason('');
            onVoided(result.message ?? 'Voided.');
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open={open}
            size="sm"
            title={title}
            onClose={close}
            footer={
                <>
                    <Button variant="secondary" onClick={close}>Keep it</Button>
                    <Button variant="danger" type="submit" form="void-form" busy={busy} disabled={reason.trim().length < 3}>Void</Button>
                </>
            }
        >
            <form id="void-form" onSubmit={submit} className="space-y-4">
                <div className="text-sm text-slate-300">{effect}</div>
                <p className="text-xs text-slate-500">Voided records stay on file, marked void, and the reason is kept in the activity log. This can&apos;t be undone.</p>
                {error && <Notice tone="error">{error}</Notice>}
                <Field label="Reason">
                    {(id) => <input id={id} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={255} placeholder="e.g. Entered twice by mistake" />}
                </Field>
            </form>
        </Modal>
    );
}
