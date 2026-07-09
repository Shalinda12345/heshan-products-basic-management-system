'use client';

import { useEffect } from 'react';

export type AlertVariant = 'success' | 'error' | 'warning' | 'info';

interface CustomAlertProps {
    isOpen: boolean;
    variant: AlertVariant;
    title: string;
    message: string;
    onClose: () => void;
}

const variantConfig = {
    success: {
        bgColor: 'bg-emerald-500',
        buttonColor: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200',
        icon: (
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
        ),
    },
    error: {
        bgColor: 'bg-rose-500',
        buttonColor: 'bg-rose-500 hover:bg-rose-600 shadow-rose-200',
        icon: (
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
        ),
    },
    warning: {
        bgColor: 'bg-amber-500',
        buttonColor: 'bg-amber-500 hover:bg-amber-600 shadow-amber-200',
        icon: (
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
        ),
    },
    info: {
        bgColor: 'bg-blue-500',
        buttonColor: 'bg-blue-500 hover:bg-blue-600 shadow-blue-200',
        icon: (
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
};

export default function CustomAlert({ isOpen, variant, title, message, onClose }: CustomAlertProps) {
    const config = variantConfig[variant];

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alert-title"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Card */}
            <div className="relative bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl shadow-black/60 w-full max-w-sm mx-auto overflow-visible animate-in zoom-in-95 duration-200">
                {/* Icon circle - overlaps top of card */}
                <div className="flex justify-center -mt-10 mb-0">
                    <div className={`flex items-center justify-center w-20 h-20 rounded-full ${config.bgColor} shadow-xl ring-4 ring-slate-900`}>
                        {config.icon}
                    </div>
                </div>

                {/* Content */}
                <div className="px-8 pt-6 pb-8 text-center">
                    <h2
                        id="alert-title"
                        className="text-3xl font-light text-slate-100 mt-2 mb-4 tracking-wide"
                    >
                        {title}
                    </h2>
                    <p className="text-slate-400 text-base leading-relaxed mb-8">
                        {message}
                    </p>
                    <button
                        onClick={onClose}
                        className={`w-full py-3.5 rounded-xl text-white font-semibold text-base tracking-wide shadow-lg ${config.buttonColor} transition-all duration-150 active:scale-[0.98]`}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}
