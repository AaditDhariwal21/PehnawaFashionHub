import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Copy, Check, Link2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import OrderReceipt from '../components/OrderReceipt.jsx';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import './OrderConfirmationPage.css';
import {
    readGuestCheckout,
    clearGuestCheckout,
    readConfirmedGuestOrder,
    saveConfirmedGuestOrder,
    readCheckoutSource,
    guestOrderLink,
} from '../utils/guestCheckout';

const API = import.meta.env.VITE_API_URL;

const MAX_POLLS = 5;
const POLL_INTERVAL = 3000; // 3 seconds

/**
 * "Save this link" — the guest's private, bookmarkable way back to the order.
 * There is no account and no email, so this link (plus order number + email
 * lookup on the order details page) is how a guest finds their order again.
 */
const SaveOrderLink = ({ token }) => {
    const [copied, setCopied] = useState(false);
    const link = guestOrderLink(token);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            window.prompt('Copy your order link:', link);
        }
    };

    return (
        <div className="ocp-card ocp-save-link">
            <h2 className="ocp-card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Link2 size={18} aria-hidden="true" /> Save your order link
            </h2>
            <p className="ocp-save-link-text">
                You checked out as a guest, so this private link is how you get back to this order to check its
                status. Bookmark it or keep it somewhere safe — anyone with the link can see the order.
            </p>
            <div className="ocp-save-link-row">
                <input
                    className="ocp-save-link-input"
                    value={link}
                    readOnly
                    aria-label="Your private order link"
                    onFocus={(e) => e.target.select()}
                />
                <button type="button" className="ocp-btn-primary ocp-copy-btn" onClick={copy}>
                    {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                    {copied ? 'Copied' : 'Copy link'}
                </button>
            </div>
            <p className="ocp-save-link-text" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                Lost it? Use <Link to="/order-details">Get order details</Link> with your order ID and email.
            </p>
        </div>
    );
};

const OrderConfirmationPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { clearCart, refreshCart, clearBuyNowItem } = useCart();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    /** Guest only: the private token for the order on screen. */
    const [guestToken, setGuestToken] = useState(null);
    const [guestEmail, setGuestEmail] = useState('');
    const confirmedRef = useRef(false);

    useEffect(() => {
        if (confirmedRef.current) return;

        /* ── Guest: returning from Square after a guest checkout ──
           Recognised by the checkout record saved just before the redirect, or
           (on a refresh) by the confirmed order kept for this tab. */
        if (!user) {
            const pending = readGuestCheckout();
            const confirmed = readConfirmedGuestOrder();
            const token = pending?.token || confirmed?.token;
            if (!token || id) { navigate('/signin'); return; }

            confirmedRef.current = true;

            const showOrder = (guestOrder) => {
                /* Done with the browser-side checkout state. The cart is cleared
                   only for a cart checkout — Buy Now leaves it alone. */
                if (pending) {
                    if (pending.source === 'buyNow') clearBuyNowItem();
                    else { clearCart(); clearBuyNowItem(); }
                    clearGuestCheckout();
                }
                saveConfirmedGuestOrder({ token, email: pending?.email || confirmed?.email || '' });
                setGuestToken(token);
                setGuestEmail(pending?.email || confirmed?.email || '');
                setOrder(guestOrder);
                setLoading(false);
            };

            const post = async (path, body) => {
                const res = await fetch(`${API}/orders/guest/${path}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                return { status: res.status, data: await res.json().catch(() => ({})) };
            };

            /* Same shape as the signed-in flow: poll for the order the webhook
               creates, then fall back to confirming the payment ourselves. */
            const pollGuest = async (attempt = 1) => {
                try {
                    const { data } = await post('view', { token });
                    if (data.success && data.order) { showOrder(data.order); return; }
                } catch (err) {
                    console.warn(`[Poll ${attempt}] Error:`, err.message);
                }

                if (attempt < MAX_POLLS) {
                    setTimeout(() => pollGuest(attempt + 1), POLL_INTERVAL);
                    return;
                }

                try {
                    const { data } = await post('confirm', { token, squareOrderId: pending?.squareOrderId });
                    if (data.success && data.order) { showOrder(data.order); return; }
                    setError(data.message || 'Unable to confirm your payment. Please contact support.');
                } catch (err) {
                    console.error('Payment verification error:', err);
                    setError('Unable to confirm your payment. Please contact support.');
                }
                setLoading(false);
            };

            pollGuest();
            return;
        }

        const token = localStorage.getItem('token');

        /* ── Flow A: Viewing an existing order by ID (e.g. "Your Orders") ── */
        if (id) {
            fetch(`${API}/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } })
                .then((r) => r.json())
                .then((data) => {
                    if (data.success) setOrder(data.order);
                    else setError(data.message || 'Order not found.');
                })
                .catch(() => setError('Failed to load order details.'))
                .finally(() => setLoading(false));
            return;
        }

        /*
         * ── Flow B: Returning from Square Checkout ──
         *
         * Primary: Poll GET /api/orders/latest-paid — the webhook should
         * have already created the order by the time the user lands here.
         *
         * Fallback: If polling fails after retries, fall back to the old
         * POST /api/orders/verify-square-payment to create the order
         * from the frontend (belt-and-suspenders).
         */
        confirmedRef.current = true;

        /* The saved cart is server-side now: whichever trigger created the
           order already removed the purchased lines, so the cart is simply
           re-read. A Buy Now purchase never touched the cart. */
        const finishCheckout = () => {
            if (readCheckoutSource() === 'buyNow') clearBuyNowItem();
            else { refreshCart(); clearBuyNowItem(); }
            try {
                sessionStorage.removeItem('pehnawa_squareOrderId');
            } catch {
                /* ignore */
            }
        };

        const pollForOrder = async (attempt = 1) => {
            try {
                const res = await fetch(`${API}/orders/latest-paid`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();

                if (data.success && data.order) {
                    finishCheckout();
                    setOrder(data.order);
                    setLoading(false);
                    return;
                }
            } catch (err) {
                console.warn(`[Poll ${attempt}] Error:`, err.message);
            }

            /* Retry if we haven't exhausted attempts */
            if (attempt < MAX_POLLS) {
                setTimeout(() => pollForOrder(attempt + 1), POLL_INTERVAL);
                return;
            }

            /* ── Fallback: use the old verify endpoint ── */
            console.log('[OrderConfirmation] Polling exhausted — falling back to verify endpoint.');
            try {
                let storedOrderId = null;
                try {
                    storedOrderId = sessionStorage.getItem('pehnawa_squareOrderId');
                } catch {
                    /* ignore */
                }
                const res = await fetch(`${API}/orders/verify-square-payment`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        squareOrderId: storedOrderId || undefined,
                    }),
                });
                const data = await res.json();

                if (data.success && data.order) {
                    finishCheckout();
                    setOrder(data.order);
                } else {
                    setError(data.message || 'Unable to confirm your payment. Please contact support.');
                }
            } catch (err) {
                console.error('Payment verification error:', err);
                setError('Unable to confirm your payment. Please contact support.');
            } finally {
                setLoading(false);
            }
        };

        pollForOrder();
    }, [id, user, navigate, clearCart, refreshCart, clearBuyNowItem]);

    /* ─── Loading State ─── */
    if (loading) {
        return (
            <div className="ocp">
                <Navbar />
                <div className="ocp-wrapper" style={{ textAlign: 'center', paddingTop: '4rem', minHeight: '50vh' }} role="status" aria-live="polite">
                    <div style={{
                        width: '3rem', height: '3rem', borderRadius: '50%',
                        border: '4px solid #e5e7eb', borderTopColor: '#EFBF04',
                        animation: 'spin 0.8s linear infinite',
                        margin: '0 auto 1.5rem',
                    }} />
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
                        Confirming your payment…
                    </h1>
                    <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
                        Please wait while we verify your payment with Square.
                    </p>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <Footer />
            </div>
        );
    }

    /* ─── Error State ─── */
    if (error) {
        return (
            <div className="ocp">
                <Navbar />
                <div className="ocp-wrapper" style={{ textAlign: 'center', paddingTop: '3rem', minHeight: '50vh' }}>
                    <div style={{
                        width: '4rem', height: '4rem', borderRadius: '50%',
                        backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', margin: '0 auto 1.5rem',
                    }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="#991b1b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>
                        Payment Issue
                    </h1>
                    <p style={{ color: '#6b7280', maxWidth: '400px', margin: '0 auto 2rem' }}>
                        {error}
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="ocp-btn-primary" onClick={() => navigate('/checkout')}>
                            Return to Checkout
                        </button>
                        <button className="ocp-btn-secondary" onClick={() => navigate('/')}>
                            Continue Shopping
                        </button>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    /* ─── No Order ─── */
    if (!order) {
        return (
            <div className="ocp">
                <Navbar />
                <div className="ocp-wrapper" style={{ textAlign: 'center', paddingTop: '4rem', minHeight: '50vh' }}>
                    <p style={{ color: '#6b7280' }}>Order not found.</p>
                </div>
                <Footer />
            </div>
        );
    }

    /* ─── Success — Show Order Details ─── */
    const isGuestView = !user && !!guestToken;

    return (
        <div className="ocp">
            <Navbar />

            <div className="ocp-wrapper">
                {/* ── Success Banner ── */}
                <div className="ocp-success-banner">
                    <div className="ocp-check-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#065f46" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="36" height="36">
                            <path d="M20 6L9 17l-5-5" />
                        </svg>
                    </div>
                    <h1 className="ocp-success-title">Your order has been placed successfully!</h1>
                    <p className="ocp-success-sub">
                        Thank you for your purchase. Your payment was processed securely via Square.
                    </p>
                </div>

                <OrderReceipt order={order} />

                {isGuestView && <SaveOrderLink token={guestToken} />}

                {isGuestView && (
                    <div className="ocp-card ocp-account-cta">
                        <div>
                            <h2 className="ocp-card-title" style={{ marginBottom: '0.35rem' }}>Want to see this in My Orders?</h2>
                            <p className="ocp-save-link-text" style={{ margin: 0 }}>
                                Create an account with the same email and this order is added to it automatically. Optional — your order is placed either way.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="ocp-btn-secondary"
                            onClick={() => navigate('/signin', {
                                state: { mode: 'signup', email: guestEmail, claimToken: guestToken },
                            })}
                        >
                            Create an account
                        </button>
                    </div>
                )}

                {/* ── Action Buttons ── */}
                <div className="ocp-actions">
                    {isGuestView ? (
                        <button className="ocp-btn-primary" onClick={() => navigate(`/order-details#t=${guestToken}`)}>
                            View order details
                        </button>
                    ) : (
                        <button className="ocp-btn-primary" onClick={() => navigate('/account', { state: { tab: 'orders' } })}>
                            View Your Orders
                        </button>
                    )}
                    <button className="ocp-btn-secondary" onClick={() => navigate('/')}>
                        Continue Shopping
                    </button>
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default OrderConfirmationPage;
