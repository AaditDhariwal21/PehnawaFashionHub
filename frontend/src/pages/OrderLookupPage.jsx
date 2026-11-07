import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PackageSearch, Loader2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import OrderReceipt from '../components/OrderReceipt.jsx';
import { useAuth } from '../context/AuthContext';
import { tokenFromHash, checkField } from '../utils/guestCheckout';
import { useToast } from '../utils/toast';
import './OrderConfirmationPage.css';
import './CheckoutPage.css';

const API = import.meta.env.VITE_API_URL;

/**
 * Get order details — how a guest gets back to an order without an account.
 * (The site doesn't offer courier tracking, so this shows the order and its
 * status as the store updates it, not a shipment trail.)
 *
 *   /order-details#t=<token>  the private link from the confirmation page: the
 *                           full order. The token stays in the #fragment and
 *                           is sent to the API in a POST body, never a URL.
 *   /order-details            order number + checkout email: a reduced view
 *                           (no street address or phone).
 *
 * Signed-in customers with a matching email can attach a guest order to
 * their account from here, after which it shows under My Orders.
 */
const OrderLookupPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const token = tokenFromHash(location.hash);

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(!!token);
    const [linkError, setLinkError] = useState('');

    const [orderId, setOrderId] = useState('');
    const [email, setEmail] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [lookupError, setLookupError] = useState('');
    const [searching, setSearching] = useState(false);

    const [claiming, setClaiming] = useState(false);
    const [claimMessage, setClaimMessage] = useState('');

    /* ── Private link ── */
    useEffect(() => {
        if (!token) return;
        let cancelled = false;

        fetch(`${API}/orders/guest/view`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return;
                if (data.success && data.order) setOrder(data.order);
                else if (data.code === 'ORDER_PROCESSING') setLinkError('Your payment is still being confirmed. Refresh this page in a minute.');
                else setLinkError(data.message || 'This order link is invalid or has expired.');
            })
            .catch(() => !cancelled && setLinkError('Could not load your order. Please check your connection and try again.'))
            .finally(() => !cancelled && setLoading(false));

        return () => { cancelled = true; };
    }, [token]);

    /* ── Order number + email ── */
    const handleLookup = async (e) => {
        e.preventDefault();
        if (searching) return;

        const errs = {};
        if (!/^PHN-[0-9]+(-[A-Za-z0-9]+)?$/.test(orderId.trim())) errs.orderId = 'Enter the order ID exactly as shown, e.g. PHN-1730000000000-A1B2C3';
        const emailError = checkField('email', email);
        if (emailError) errs.email = emailError;
        setFieldErrors(errs);
        if (Object.keys(errs).length) {
            document.getElementById(errs.orderId ? 'track-orderId' : 'track-email')?.focus();
            return;
        }

        setSearching(true);
        setLookupError('');
        try {
            const res = await fetch(`${API}/orders/guest/lookup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: orderId.trim(), email: email.trim() }),
            });
            const data = await res.json();
            if (data.success && data.order) setOrder(data.order);
            else setLookupError(data.message || "We couldn't find an order matching those details.");
        } catch {
            setLookupError('Something went wrong. Please check your connection and try again.');
        } finally {
            setSearching(false);
        }
    };

    /* ── Attach to the signed-in account ── */
    const handleClaim = async () => {
        if (claiming) return;
        setClaiming(true);
        setClaimMessage('');
        try {
            const res = await fetch(`${API}/orders/guest/claim`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ token }),
            });
            const data = await res.json();
            if (data.success && data.order?._id) {
                toast.success('Your order has been added to your account');
                navigate(`/account/orders/${data.order._id}`);
                return;
            }
            setClaimMessage(data.message || 'Could not add this order to your account.');
        } catch {
            setClaimMessage('Something went wrong. Please try again.');
        } finally {
            setClaiming(false);
        }
    };

    const canClaim = !!token && !!order && !order.limitedView && !order.claimed && user?.role !== 'admin';

    return (
        <div className="ocp">
            <Navbar />

            <div className="ocp-wrapper" style={{ minHeight: '60vh' }}>
                <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                    <div className="ocp-check-icon" style={{ background: '#fef3c7' }}>
                        <PackageSearch size={30} color="#b45309" aria-hidden="true" />
                    </div>
                    <h1 className="ocp-success-title">Get your order details</h1>
                    <p className="ocp-success-sub">
                        {order ? 'Here are the latest details for your order.' : 'Checked out as a guest? Find your order here.'}
                    </p>
                </div>

                {loading && (
                    <div style={{ textAlign: 'center', padding: '2rem 0' }} role="status" aria-live="polite">
                        <Loader2 size={28} className="shipping-spinner" color="#EFBF04" />
                        <p style={{ color: '#6b7280', marginTop: '0.75rem' }}>Loading your order…</p>
                    </div>
                )}

                {!loading && order && (
                    <>
                        <OrderReceipt order={order} />

                        {order.limitedView && (
                            <p className="ocp-save-link-text" style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                                Showing a summary. Your private order link (from the confirmation page) shows the full details.
                            </p>
                        )}

                        {canClaim && (
                            <div className="ocp-card ocp-account-cta">
                                <div>
                                    <h2 className="ocp-card-title" style={{ marginBottom: '0.35rem' }}>Add this order to your account</h2>
                                    <p className="ocp-save-link-text" style={{ margin: 0 }}>
                                        {user
                                            ? 'It will appear under My Orders. Your account email must match the email used at checkout.'
                                            : 'Sign in or create an account with the email you used at checkout to see this order under My Orders.'}
                                    </p>
                                    {claimMessage && <p role="alert" className="checkout-form-error" style={{ marginTop: '0.75rem', marginBottom: 0 }}>{claimMessage}</p>}
                                </div>
                                {user ? (
                                    <button type="button" className="ocp-btn-secondary" onClick={handleClaim} disabled={claiming}>
                                        {claiming ? 'Adding…' : 'Add to my account'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="ocp-btn-secondary"
                                        onClick={() => navigate('/signin', { state: { claimToken: token } })}
                                    >
                                        Sign in
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="ocp-actions">
                            <button className="ocp-btn-primary" onClick={() => navigate('/')}>Continue Shopping</button>
                            {!token && (
                                <button className="ocp-btn-secondary" onClick={() => { setOrder(null); setLookupError(''); }}>
                                    Look up another order
                                </button>
                            )}
                        </div>
                    </>
                )}

                {!loading && !order && (
                    <div className="ocp-card" style={{ maxWidth: '520px', margin: '0 auto' }}>
                        {linkError && (
                            <p role="alert" className="checkout-form-error">{linkError} You can also look your order up below.</p>
                        )}
                        <h2 className="ocp-card-title">Find your order</h2>
                        <form onSubmit={handleLookup} noValidate>
                            <div style={{ marginBottom: '1.1rem' }}>
                                <label htmlFor="track-orderId" className="track-label">Order ID</label>
                                <input
                                    id="track-orderId"
                                    name="orderId"
                                    className={`checkout-input${fieldErrors.orderId ? ' input-error' : ''}`}
                                    value={orderId}
                                    onChange={(e) => { setOrderId(e.target.value); setFieldErrors((p) => ({ ...p, orderId: '' })); }}
                                    placeholder="PHN-1730000000000-A1B2C3"
                                    autoCapitalize="characters"
                                    autoCorrect="off"
                                    spellCheck="false"
                                    autoComplete="off"
                                    enterKeyHint="next"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('track-email')?.focus(); }
                                    }}
                                    aria-invalid={fieldErrors.orderId ? 'true' : undefined}
                                    aria-describedby={fieldErrors.orderId ? 'track-orderId-error' : undefined}
                                />
                                {fieldErrors.orderId && <span id="track-orderId-error" className="field-error" role="alert">{fieldErrors.orderId}</span>}
                            </div>
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label htmlFor="track-email" className="track-label">Email used at checkout</label>
                                <input
                                    id="track-email"
                                    name="email"
                                    type="email"
                                    inputMode="email"
                                    autoComplete="email"
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    spellCheck="false"
                                    enterKeyHint="search"
                                    className={`checkout-input${fieldErrors.email ? ' input-error' : ''}`}
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: '' })); }}
                                    placeholder="you@example.com"
                                    aria-invalid={fieldErrors.email ? 'true' : undefined}
                                    aria-describedby={fieldErrors.email ? 'track-email-error' : undefined}
                                />
                                {fieldErrors.email && <span id="track-email-error" className="field-error" role="alert">{fieldErrors.email}</span>}
                            </div>
                            {lookupError && <p role="alert" className="checkout-form-error">{lookupError}</p>}
                            <button type="submit" className="checkout-pay-btn" disabled={searching}>
                                {searching ? <Loader2 size={16} className="shipping-spinner" /> : <PackageSearch size={16} />}
                                {searching ? 'Searching…' : 'Find my order'}
                            </button>
                        </form>
                        <p className="ocp-save-link-text" style={{ marginTop: '1rem', marginBottom: 0 }}>
                            Have an account? Your orders are under{' '}
                            <a href="/account" onClick={(e) => { e.preventDefault(); navigate(user ? '/account' : '/signin', { state: { tab: 'orders' } }); }}>
                                My Orders
                            </a>.
                        </p>
                    </div>
                )}
            </div>

            <Footer />
        </div>
    );
};

export default OrderLookupPage;
