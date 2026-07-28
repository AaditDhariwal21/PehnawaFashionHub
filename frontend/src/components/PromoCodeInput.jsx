import { useState } from 'react';
import { Tag, Check, X, Loader2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import formatPrice from '../utils/formatPrice';
import { promoErrorMessage } from '../utils/promoErrors';

const API = import.meta.env.VITE_API_URL;

/**
 * Promo code entry for the checkout order summary.
 *
 * Applied state is owned by CartContext, not this component, so it survives
 * navigation and is invalidated centrally when the cart changes. Every figure
 * shown comes from the server's validate response — nothing here computes a
 * discount.
 *
 * @param {Array}   checkoutItems the live checkout set (cart, or the Buy Now item)
 * @param {boolean} disabled      lock input while the parent is placing an order
 */
const PromoCodeInput = ({ checkoutItems, disabled = false }) => {
    const { appliedPromo, applyPromo, clearPromo } = useCart();
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [applying, setApplying] = useState(false);

    const handleApply = async (e) => {
        e.preventDefault();
        if (applying || disabled) return;

        const trimmed = code.trim();
        if (!trimmed) {
            setError('Enter a promo code to apply.');
            return;
        }

        setApplying(true);
        setError('');

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setError('Please sign in to use a promo code.');
                return;
            }

            const res = await fetch(`${API}/promo/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    code: trimmed,
                    cartItems: checkoutItems.map((ci) => ({
                        productId: ci.productId,
                        size: ci.size || '',
                        color: ci.color || '',
                        quantity: ci.quantity,
                    })),
                }),
            });

            const data = await res.json();

            if (data.success && data.promo) {
                applyPromo(data.promo);
                setCode('');
            } else {
                setError(promoErrorMessage(data, formatPrice));
            }
        } catch (err) {
            console.error('Promo validation error:', err);
            setError('Could not check that code. Please try again.');
        } finally {
            setApplying(false);
        }
    };

    const handleRemove = () => {
        clearPromo();
        setCode('');
        setError('');
    };

    /* ─── Applied state — locked, with an explicit Remove.
           No second input is offered, so codes can't be silently stacked. ─── */
    if (appliedPromo) {
        return (
            <div style={{ marginBottom: '1rem' }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        padding: '0.7rem 0.85rem',
                        backgroundColor: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid #10b981',
                        borderRadius: '0.5rem',
                    }}
                >
                    <Check size={16} strokeWidth={3} color="#059669" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                            style={{
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: '#065f46',
                                letterSpacing: '0.03em',
                                lineHeight: 1.3,
                            }}
                        >
                            {appliedPromo.code}
                        </p>
                        <p style={{ fontSize: '0.75rem', color: '#047857', lineHeight: 1.35 }}>
                            {formatPrice(appliedPromo.discountAmount)} off
                            {appliedPromo.appliesToWholeCart === false && ' eligible items'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleRemove}
                        disabled={disabled}
                        aria-label={`Remove promo code ${appliedPromo.code}`}
                        className="min-h-11 md:min-h-0"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: '#6b7280',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            padding: '0 0.15rem',
                            fontFamily: 'inherit',
                            flexShrink: 0,
                        }}
                    >
                        <X size={14} />
                        Remove
                    </button>
                </div>
            </div>
        );
    }

    /* ─── Entry state ─── */
    return (
        <div style={{ marginBottom: '1rem' }}>
            {/* Not a <form> — this sits inside the checkout form, and nesting
                forms is invalid HTML. Enter is handled explicitly instead so it
                applies the code rather than submitting the order. */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <Tag
                        size={15}
                        color="#9ca3af"
                        style={{
                            position: 'absolute',
                            left: '0.65rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            pointerEvents: 'none',
                        }}
                    />
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => {
                            setCode(e.target.value.toUpperCase());
                            if (error) setError('');
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleApply(e);
                        }}
                        disabled={applying || disabled}
                        placeholder="Promo code"
                        aria-label="Promo code"
                        autoComplete="off"
                        spellCheck="false"
                        style={{
                            width: '100%',
                            padding: '0.65rem 0.75rem 0.65rem 2.1rem',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            letterSpacing: '0.05em',
                            color: '#111827',
                            backgroundColor: '#fff',
                            border: `1px solid ${error ? '#ef4444' : '#e5e7eb'}`,
                            borderRadius: '0.5rem',
                            outline: 'none',
                            fontFamily: 'inherit',
                            textTransform: 'uppercase',
                        }}
                    />
                </div>
                <button
                    type="button"
                    onClick={handleApply}
                    disabled={applying || disabled || !code.trim()}
                    style={{
                        padding: '0.65rem 1.1rem',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: applying || disabled || !code.trim() ? '#9ca3af' : '#111827',
                        backgroundColor: 'transparent',
                        border: `1px solid ${applying || disabled || !code.trim() ? '#e5e7eb' : '#111827'}`,
                        borderRadius: '0.5rem',
                        cursor: applying || disabled || !code.trim() ? 'not-allowed' : 'pointer',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        fontFamily: 'inherit',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        transition: 'all 0.15s',
                    }}
                >
                    {applying ? <Loader2 size={14} className="shipping-spinner" /> : 'Apply'}
                </button>
            </div>

            {error && (
                <p
                    role="alert"
                    style={{
                        fontSize: '0.75rem',
                        color: '#ef4444',
                        marginTop: '0.4rem',
                        lineHeight: 1.4,
                    }}
                >
                    {error}
                </p>
            )}
        </div>
    );
};

export default PromoCodeInput;
