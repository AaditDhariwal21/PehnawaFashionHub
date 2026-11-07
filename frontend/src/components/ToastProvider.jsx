import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { ToastContext } from '../utils/toast';
import './Toast.css';

const DURATION_MS = { success: 3000, info: 3500, error: 4500 };
const MAX_VISIBLE = 3;

const ICONS = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
};

/** One toast. Owns its auto-dismiss timer, so unmounting always clears it. */
const ToastItem = ({ toast, onDismiss }) => {
    const Icon = ICONS[toast.type] || Info;

    useEffect(() => {
        const timer = setTimeout(() => onDismiss(toast.id), DURATION_MS[toast.type] || 3000);
        return () => clearTimeout(timer);
        /* `shownAt` changes when the same message is shown again, restarting the clock. */
    }, [toast.id, toast.type, toast.shownAt, onDismiss]);

    return (
        <div className={`pw-toast pw-toast--${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
            <span className="pw-toast-icon" aria-hidden="true">
                <Icon size={18} strokeWidth={2.4} />
            </span>
            <p className="pw-toast-message">{toast.message}</p>
            <button
                type="button"
                className="pw-toast-close"
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss notification"
            >
                <X size={16} strokeWidth={2.4} />
            </button>
        </div>
    );
};

/**
 * Provides useToast() to the app and renders the toast stack.
 *
 * Behaviour:
 *   · Stacks up to three; the oldest is dropped first.
 *   · The same message shown again (e.g. a double click) restarts the
 *     existing toast's timer instead of stacking a duplicate.
 *   · Auto-dismisses (errors stay a little longer); tapping × closes it.
 *   · Announced to screen readers: errors as alerts, the rest politely.
 *   · Positioned under the navbar — top-centre on phones, top-right on wider
 *     screens — so it never covers the cart drawer's confirmation, the compare
 *     bar/notice, the mobile bottom nav or the checkout Pay bar, which all
 *     live at the bottom of the screen.
 */
const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(1);

    const dismiss = useCallback((id) => {
        setToasts((list) => list.filter((t) => t.id !== id));
    }, []);

    const show = useCallback((type, message) => {
        if (!message) return;
        const id = nextId.current++;
        const shownAt = Date.now();
        setToasts((list) => {
            const existing = list.find((t) => t.message === message && t.type === type);
            if (existing) {
                return list.map((t) => (t.id === existing.id ? { ...t, shownAt } : t));
            }
            return [...list, { id, type, message, shownAt }].slice(-MAX_VISIBLE);
        });
    }, []);

    const api = useMemo(() => ({
        success: (message) => show('success', message),
        error: (message) => show('error', message),
        info: (message) => show('info', message),
        dismiss,
    }), [show, dismiss]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="pw-toast-viewport" aria-live="polite" aria-relevant="additions">
                {toasts.map((t) => (
                    <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export default ToastProvider;
