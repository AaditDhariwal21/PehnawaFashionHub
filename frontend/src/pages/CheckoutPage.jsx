import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Lock, Loader2, UserRound } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import formatPrice from '../utils/formatPrice';
import './CheckoutPage.css';
import CloudinaryImage from '../components/CloudinaryImage.jsx';
import PromoCodeInput from '../components/PromoCodeInput.jsx';
import { promoErrorMessage } from '../utils/promoErrors';
import { useSiteConfig } from '../utils/siteConfig';
import {
    saveGuestCheckout,
    saveCheckoutSource,
    newCheckoutAttemptId,
    checkField,
    SERVER_FIELD_TO_FORM,
} from '../utils/guestCheckout';

const FALLBACK_SHIPPING = 8;
const API = import.meta.env.VITE_API_URL;

/** Field order for validation focus and the keyboard's "next" key. */
const FIELD_ORDER = ['email', 'fullName', 'contactNumber', 'street', 'apartment', 'city', 'state', 'zip'];

const MOBILE_QUERY = '(max-width: 768px)';
const isMobileViewport = () => window.matchMedia?.(MOBILE_QUERY).matches ?? false;

/** Phone layout? Tracks rotation/resizes, so exactly one Pay button is ever rendered. */
const useIsMobile = () => {
    const [mobile, setMobile] = useState(isMobileViewport);
    useEffect(() => {
        const mq = window.matchMedia?.(MOBILE_QUERY);
        if (!mq) return undefined;
        const onChange = () => setMobile(mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return mobile;
};

/* ─── Label helper ─── */
const Label = ({ htmlFor, children, required }) => (
    <label
        htmlFor={htmlFor}
        style={{
            display: 'block',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: '#374151',
            marginBottom: '0.4rem',
            letterSpacing: '0.02em',
        }}
    >
        {children}
        {required && <span style={{ color: '#ef4444', marginLeft: '0.2rem' }}>*</span>}
    </label>
);

const sectionHeadingStyle = {
    fontSize: '1.15rem',
    fontWeight: 700,
    color: '#111827',
    marginBottom: '1.25rem',
    paddingBottom: '0.6rem',
    borderBottom: '1px solid #e5e7eb',
};

const CheckoutPage = () => {
    const navigate = useNavigate();
    const { cartItems, getSubtotal, buyNowItem, clearBuyNowItem, appliedPromo } = useCart();
    const { user } = useAuth();
    const [placing, setPlacing] = useState(false);
    const [errors, setErrors] = useState({});
    /* Set when create-checkout rejects the promo at the last moment — the cart
       can drift between Apply and Pay, and the server has the final word. */
    const [promoError, setPromoError] = useState('');
    /* Any other reason the server refused to start checkout, shown inline next
       to the Pay button rather than in a blocking alert(). */
    const [formError, setFormError] = useState('');
    /* Mobile: hide the sticky Pay bar while a field is focused (keyboard open)
       so it never covers the input being typed into. */
    const [fieldFocused, setFieldFocused] = useState(false);
    const isMobile = useIsMobile();

    /* ── Shipping rate state ── */
    const [shippingCost, setShippingCost] = useState(null);
    const [shippingService, setShippingService] = useState('Flat Rate');
    const [shippingLoading, setShippingLoading] = useState(false);
    const [shippingFetched, setShippingFetched] = useState(false);

    /* ── Determine checkout mode ── */
    const isBuyNow = !!buyNowItem;
    const checkoutItems = useMemo(
        () => (isBuyNow ? [buyNowItem] : cartItems),
        [isBuyNow, buyNowItem, cartItems]
    );

    /* Signed out: guest checkout when it's enabled, otherwise Pay sends the
       customer to sign in, as before. */
    const isGuest = !user;
    /* The backend's GUEST_CHECKOUT_ENABLED (the single switch, on Render).
       null while it loads; false if it's off or unreachable. */
    const guestCheckoutEnabled = useSiteConfig()?.guestCheckoutEnabled ?? null;

    /* Admin accounts cannot place orders. This disables the button and explains
       why — nothing more. The enforcement is blockAdminOrders on the
       create-checkout and confirm routes server-side; this check exists so an
       admin is told before clicking rather than by a 403 afterwards. Everything
       else on the page stays interactive so checkout remains inspectable.

       Keyed off the role, not the admin/customer view toggle: previewing the
       site as a customer does not stop the account from being an admin, and the
       server will refuse it either way. */
    const isAdminAccount = user?.role === 'admin';

    const subtotal = isBuyNow
        ? buyNowItem.price * buyNowItem.quantity
        : getSubtotal();
    const shippingKnown = shippingCost !== null;

    /* Both components of the total are server-computed: the discount comes
       from /api/promo/validate and the shipping rate from /api/shipping/rates.
       Nothing here derives a discount locally, and create-checkout recomputes
       the whole total independently before charging anything. */
    const discountAmount = appliedPromo?.discountAmount ?? 0;
    const total = subtotal - discountAmount + (shippingKnown ? shippingCost : 0);

    /* ── Abort controller ref to cancel in-flight requests ── */
    const abortRef = useRef(null);
    const autofilled = useRef(false);
    /** The address the current shipping rate was fetched for. */
    const shippingKeyRef = useRef('');
    /** Synchronous double-submit guard — state updates are too slow for a double tap. */
    const placingRef = useRef(false);
    /**
     * Idempotency key for create-checkout. Kept while the order being placed is
     * unchanged, so a retry, a double tap or a return from Square reuses the
     * same payment link; replaced as soon as anything about the order changes.
     */
    const attemptRef = useRef({ key: null, id: null });
    const focusTimerRef = useRef(null);

    const [form, setForm] = useState(() => ({
        email: user?.email || '',
        fullName: '',
        contactNumber: '',
        street: '',
        apartment: '',
        city: '',
        state: '',
        zip: '',
        country: 'United States',
    }));

    /* ── Autofill from saved address ── */
    useEffect(() => {
        if (!user || autofilled.current) return;
        const token = localStorage.getItem('token');
        if (!token) return;

        fetch(`${API}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((data) => {
                if (!data.success || !data.user?.address) return;
                const addr = data.user.address;
                // Only autofill if the form hasn't been manually edited
                setForm((prev) => ({
                    email: prev.email || data.user.email || '',
                    fullName: prev.fullName || addr.fullName || '',
                    contactNumber: prev.contactNumber || addr.phone || '',
                    street: prev.street || addr.addressLine1 || '',
                    apartment: prev.apartment || addr.addressLine2 || '',
                    city: prev.city || addr.city || '',
                    state: prev.state || addr.state || '',
                    zip: prev.zip || addr.zip || '',
                    country: prev.country || addr.country || 'United States',
                }));
                autofilled.current = true;
            })
            .catch((err) => {
                console.error('Address autofill error:', err);
                // Graceful fallback: keep fields empty
            });
    }, [user]);

    useEffect(() => () => clearTimeout(focusTimerRef.current), []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
        if (formError) setFormError('');
    };

    /* Inline validation once the customer leaves a field they've typed in. */
    const handleBlur = (e) => {
        const { name, value } = e.target;
        if (!value.trim() && !errors[name]) return;
        const message = checkField(name, value);
        setErrors((prev) => ({ ...prev, [name]: message }));
    };

    /* ── Fetch live shipping rate from Shippo ── */
    const fetchShippingRate = useCallback(async (formData, { force = false } = {}) => {
        const { street, city, state, zip, fullName, contactNumber } = formData;

        /* Only call when all address fields are populated and ZIP is at least 5 chars */
        if (!street?.trim() || !city?.trim() || !state?.trim() || !zip?.trim() || zip.trim().length < 5) {
            return;
        }

        const key = JSON.stringify([
            street.trim(), city.trim(), state.trim(), zip.trim(),
            checkoutItems.map((ci) => [ci.productId, ci.quantity]),
        ]);
        if (!force && key === shippingKeyRef.current) return;
        shippingKeyRef.current = key;

        /* Cancel any previous in-flight request */
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setShippingLoading(true);

        try {
            const res = await fetch(`${API}/shipping/rates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    name: fullName,
                    phone: contactNumber,
                    address: street,
                    city,
                    state,
                    zip,
                    cartItems: checkoutItems.map((ci) => ({
                        productId: ci.productId,
                        quantity: ci.quantity,
                    })),
                }),
            });

            const data = await res.json();

            if (data.success && typeof data.shippingCost === 'number') {
                setShippingCost(data.shippingCost);
                setShippingService(data.service || 'USPS');
            } else {
                setShippingCost(FALLBACK_SHIPPING);
                setShippingService('Flat Rate');
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Shipping rate error:', err);
                setShippingCost(FALLBACK_SHIPPING);
                setShippingService('Flat Rate');
            }
        } finally {
            if (abortRef.current === controller) {
                setShippingLoading(false);
                setShippingFetched(true);
            }
        }
    }, [checkoutItems]);

    /* Calculate shipping as soon as the address is complete — including when it
       was filled by the browser's autofill or from the saved address, which
       never blur the ZIP field. Debounced so typing doesn't fire a request per
       keystroke. */
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchShippingRate({
                street: form.street,
                city: form.city,
                state: form.state,
                zip: form.zip,
                fullName: form.fullName,
                contactNumber: form.contactNumber,
            });
        }, 700);
        return () => clearTimeout(timer);
    }, [form.street, form.city, form.state, form.zip, form.fullName, form.contactNumber, fetchShippingRate]);

    /* ── Trigger shipping rate fetch on ZIP blur ── */
    const handleZipBlur = (e) => {
        handleBlur(e);
        fetchShippingRate(form);
    };

    const focusField = (name) => {
        const el = document.getElementById(name);
        if (!el) return;
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    /* Enter on a phone keyboard moves to the next field instead of submitting
       half a form; on the last address field it just closes the keyboard. */
    const handleKeyDown = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const idx = FIELD_ORDER.indexOf(e.target.name);
        const next = FIELD_ORDER[idx + 1];
        if (next) focusField(next);
        else e.target.blur();
    };

    /* Mobile: keep the focused field visible above the on-screen keyboard. The
       keyboard animates in after focus, so scroll once it has settled. */
    const handleFormFocus = (e) => {
        if (!e.target.matches?.('input, select, textarea')) return;
        setFieldFocused(true);
        if (!isMobileViewport()) return;
        clearTimeout(focusTimerRef.current);
        const el = e.target;
        focusTimerRef.current = setTimeout(() => {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 320);
    };

    const handleFormBlur = () => {
        /* Moving between fields blurs one and focuses the next; only treat it
           as "keyboard closed" if nothing else took focus. */
        setTimeout(() => {
            const active = document.activeElement;
            if (!active?.matches?.('input, select, textarea')) setFieldFocused(false);
        }, 80);
    };

    const validate = () => {
        const errs = {};
        for (const name of FIELD_ORDER) {
            const message = checkField(name, form[name]);
            if (message) errs[name] = message;
        }
        setErrors(errs);
        const firstInvalid = FIELD_ORDER.find((name) => errs[name]);
        if (firstInvalid) focusField(firstInvalid);
        return !firstInvalid;
    };

    const buildPayload = () => ({
        cartItems: checkoutItems.map((ci) => ({
            productId: ci.productId,
            size: ci.size || '',
            color: ci.color || '',
            quantity: ci.quantity,
        })),
        shippingAddress: {
            fullName: form.fullName.trim(),
            phone: form.contactNumber.trim(),
            addressLine1: form.street.trim(),
            addressLine2: form.apartment.trim(),
            city: form.city.trim(),
            state: form.state.trim(),
            zipCode: form.zip.trim(),
            country: form.country,
        },
        /* No money fields are sent. The rate is recalculated server-side from
           the address and product weights, and only the promo *code* travels —
           the server re-validates it and recomputes the discount from the cart
           it resolves. */
        promoCode: appliedPromo?.code,
        checkoutSource: isBuyNow ? 'buyNow' : 'cart',
        /* The guest's email identifies their checkout; an account customer's is
           the order's contact email (pre-filled from the account). */
        ...(isGuest ? { email: form.email.trim() } : { contactEmail: form.email.trim() }),
    });

    const submitCheckout = async (body) => {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API}/payments/${isGuest ? 'guest/create-checkout' : 'create-checkout'}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(!isGuest && token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
        });
        return res.json();
    };

    const handlePayNow = async (e) => {
        e.preventDefault();
        if (placingRef.current) return;

        /* Only a definite "off" sends the customer to sign in. While the setting
           is still loading, the request goes ahead and the server decides
           (GUEST_CHECKOUT_DISABLED is handled below). */
        if (isGuest && guestCheckoutEnabled === false) {
            navigate('/signin', { state: { from: '/checkout' } });
            return;
        }
        if (isAdminAccount) return;
        if (!validate()) return;

        /* If shipping hasn't been calculated yet, fetch it first */
        if (!shippingKnown) {
            fetchShippingRate(form, { force: true });
            return;
        }

        placingRef.current = true;
        setPlacing(true);
        setPromoError('');
        setFormError('');
        let redirecting = false;

        try {
            const payload = buildPayload();
            const key = JSON.stringify(payload);
            if (attemptRef.current.key !== key) {
                attemptRef.current = { key, id: newCheckoutAttemptId() };
            }

            let data = await submitCheckout({ ...payload, checkoutAttemptId: attemptRef.current.id });

            /* The server saw this attempt id with different details, or its
               payment link has since been deactivated: start a fresh attempt. */
            if (data.code === 'CHECKOUT_CHANGED' || data.code === 'CHECKOUT_EXPIRED') {
                attemptRef.current = { key, id: newCheckoutAttemptId() };
                data = await submitCheckout({ ...payload, checkoutAttemptId: attemptRef.current.id });
            }

            if (data.success && data.checkoutUrl) {
                const source = isBuyNow ? 'buyNow' : 'cart';
                if (isGuest) {
                    saveGuestCheckout({
                        squareOrderId: data.squareOrderId,
                        token: data.guestToken,
                        source,
                        email: form.email.trim(),
                    });
                } else {
                    try {
                        if (data.squareOrderId) sessionStorage.setItem('pehnawa_squareOrderId', data.squareOrderId);
                    } catch {
                        /* the confirmation page falls back to the latest checkout */
                    }
                    saveCheckoutSource(source);
                }
                redirecting = true;
                window.location.href = data.checkoutUrl;
                return;
            }

            if (data.code === 'GUEST_CHECKOUT_DISABLED') {
                navigate('/signin', { state: { from: '/checkout' } });
            } else if (data.code?.startsWith('PROMO_')) {
                /* The code stopped being valid between Apply and Pay. Show the
                   specific reason inline, and leave the order un-placed so the
                   customer can drop the code. */
                setPromoError(promoErrorMessage(data, formatPrice));
            } else if (data.code === 'VALIDATION_ERROR' && SERVER_FIELD_TO_FORM[data.field]) {
                const field = SERVER_FIELD_TO_FORM[data.field];
                setErrors((prev) => ({ ...prev, [field]: data.message }));
                focusField(field);
            } else {
                /* ADMIN_CANNOT_ORDER (only reachable if the disabled button was
                   bypassed), stock or availability changes, rate limiting… —
                   the server's message is the authoritative one. */
                setFormError(data.message || 'We couldn’t start checkout. Please try again.');
            }
        } catch (err) {
            console.error('Checkout error:', err);
            setFormError('Something went wrong. Please check your connection and try again.');
        } finally {
            if (!redirecting) {
                placingRef.current = false;
                setPlacing(false);
            }
        }
    };

    /* ─── Empty checkout guard ─── */
    if (checkoutItems.length === 0) {
        return (
            <div className="checkout-page">
                <Navbar />
                <div
                    style={{
                        maxWidth: '1200px',
                        margin: '0 auto',
                        padding: '4rem 2rem',
                        textAlign: 'center',
                    }}
                >
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', marginBottom: '0.75rem' }}>
                        Your cart is empty
                    </h2>
                    <p style={{ fontSize: '0.95rem', color: '#6b7280', marginBottom: '1.5rem' }}>
                        Add some items before checking out.
                    </p>
                    <button
                        onClick={() => navigate('/')}
                        className="min-h-11"
                        style={{
                            padding: '0.75rem 2rem',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            color: '#fff',
                            background: 'linear-gradient(135deg, #EFBF04, #d4a904)',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                    >
                        Continue Shopping
                    </button>
                </div>
                <Footer />
            </div>
        );
    }

    /** Props shared by every text field: value, validation wiring, a11y. */
    const fieldProps = (name) => ({
        id: name,
        name,
        value: form[name],
        onChange: handleChange,
        onBlur: name === 'zip' ? handleZipBlur : handleBlur,
        onKeyDown: handleKeyDown,
        className: `checkout-input${errors[name] ? ' input-error' : ''}`,
        'aria-invalid': errors[name] ? 'true' : undefined,
        'aria-describedby': errors[name] ? `${name}-error` : undefined,
        enterKeyHint: name === 'zip' ? 'done' : 'next',
    });

    const fieldError = (name) =>
        errors[name] ? <span id={`${name}-error`} className="field-error" role="alert">{errors[name]}</span> : null;

    const payDisabled = placing || shippingLoading || !shippingKnown || isAdminAccount;
    const payLabel = placing ? 'Placing Order…' : 'Pay Now';
    const totalLabel = shippingLoading ? 'Calculating…' : shippingKnown ? formatPrice(total) : '—';

    return (
        <div className="checkout-page">
            <Navbar />

            {/* Header */}
            <div className="px-4 md:px-8 pt-8" style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <h1
                    className="text-[1.5rem] md:text-[2rem]"
                    style={{
                        fontWeight: 700,
                        color: '#111827',
                        textAlign: 'center',
                        marginBottom: '0.5rem',
                    }}
                >
                    Checkout
                </h1>
                {/* Breadcrumb */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                        color: '#9ca3af',
                        marginBottom: '2rem',
                    }}
                >
                    <span
                        onClick={() => navigate('/')}
                        style={{ cursor: 'pointer', transition: 'color 0.15s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#111827')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#9ca3af')}
                    >
                        Home
                    </span>
                    <span>›</span>
                    <span
                        onClick={() => navigate('/cart')}
                        style={{ cursor: 'pointer', transition: 'color 0.15s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#111827')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#9ca3af')}
                    >
                        Cart
                    </span>
                    <span>›</span>
                    <span style={{ color: '#6b7280' }}>Checkout</span>
                </div>
            </div>

            {/* ═══════ Main two-column layout ═══════ */}
            <form
                id="checkout-form"
                onSubmit={handlePayNow}
                onFocus={handleFormFocus}
                onBlur={handleFormBlur}
                className="checkout-container"
                noValidate
            >
                {/* ──── LEFT PANEL – Customer Details ──── */}
                <div className="checkout-left">
                    {/* Signed-out banner */}
                    {isGuest && guestCheckoutEnabled !== null && (
                        <div className="checkout-guest-banner">
                            <UserRound size={18} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, color: '#b45309' }} />
                            <p style={{ margin: 0 }}>
                                {guestCheckoutEnabled
                                    ? <>Checking out as a <strong>guest</strong> — no account needed.</>
                                    : <>You&apos;ll be asked to sign in to place your order.</>}
                                {' '}
                                <button
                                    type="button"
                                    className="checkout-link-btn"
                                    onClick={() => navigate('/signin', { state: { from: '/checkout' } })}
                                >
                                    {guestCheckoutEnabled ? 'Have an account? Sign in' : 'Sign in'}
                                </button>
                            </p>
                        </div>
                    )}

                    {/* Contact Section */}
                    <h2 style={sectionHeadingStyle}>Contact Information</h2>

                    <div style={{ marginBottom: '1.1rem' }}>
                        <Label htmlFor="email" required>Email</Label>
                        <input
                            {...fieldProps('email')}
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck="false"
                            placeholder="you@example.com"
                        />
                        {fieldError('email') || (
                            <span className="field-hint">
                                {isGuest
                                    ? 'We use this to contact you about your order.'
                                    : 'Pre-filled from your account. Changing it here only affects this order.'}
                            </span>
                        )}
                    </div>

                    <div style={{ marginBottom: '1.1rem' }}>
                        <Label htmlFor="fullName" required>Full Name</Label>
                        <input
                            {...fieldProps('fullName')}
                            type="text"
                            autoComplete="name"
                            autoCapitalize="words"
                            placeholder="John Doe"
                        />
                        {fieldError('fullName')}
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                        <Label htmlFor="contactNumber" required>Contact Number</Label>
                        <input
                            {...fieldProps('contactNumber')}
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            placeholder="+1 (555) 000-0000"
                        />
                        {fieldError('contactNumber')}
                    </div>

                    {/* Address Section */}
                    <h2 style={sectionHeadingStyle}>Shipping Address</h2>

                    <div style={{ marginBottom: '1.1rem' }}>
                        <Label htmlFor="street" required>Street Address</Label>
                        <input
                            {...fieldProps('street')}
                            type="text"
                            autoComplete="address-line1"
                            placeholder="123 Main Street"
                        />
                        {fieldError('street')}
                    </div>

                    <div style={{ marginBottom: '1.1rem' }}>
                        <Label htmlFor="apartment">Apartment / Suite</Label>
                        <input
                            {...fieldProps('apartment')}
                            type="text"
                            autoComplete="address-line2"
                            placeholder="Apt 4B (optional)"
                        />
                        {fieldError('apartment')}
                    </div>

                    <div className="checkout-row" style={{ marginBottom: '1.1rem' }}>
                        <div>
                            <Label htmlFor="city" required>City</Label>
                            <input
                                {...fieldProps('city')}
                                type="text"
                                autoComplete="address-level2"
                                placeholder="New York"
                            />
                            {fieldError('city')}
                        </div>
                        <div>
                            <Label htmlFor="state" required>State / Province</Label>
                            <input
                                {...fieldProps('state')}
                                type="text"
                                autoComplete="address-level1"
                                placeholder="NY"
                            />
                            {fieldError('state')}
                        </div>
                    </div>

                    <div className="checkout-row" style={{ marginBottom: '1.1rem' }}>
                        <div>
                            <Label htmlFor="zip" required>ZIP / Postal Code</Label>
                            <input
                                {...fieldProps('zip')}
                                type="text"
                                autoComplete="postal-code"
                                autoCapitalize="characters"
                                placeholder="10001"
                            />
                            {fieldError('zip')}
                        </div>
                        <div>
                            <Label htmlFor="country">Country</Label>
                            <select
                                id="country"
                                name="country"
                                className="checkout-select"
                                autoComplete="country-name"
                                value={form.country}
                                onChange={handleChange}
                            >
                                <option>United States</option>
                                <option>Canada</option>
                                <option>United Kingdom</option>
                                <option>India</option>
                            </select>
                        </div>
                    </div>

                    {/* Back to cart link */}
                    <button
                        type="button"
                        className="min-h-11 md:min-h-0"
                        onClick={() => {
                            if (isBuyNow) {
                                clearBuyNowItem();
                                navigate(-1);
                            } else {
                                navigate('/cart');
                            }
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            marginTop: '1.5rem',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: '#6b7280',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            padding: 0,
                            fontFamily: 'inherit',
                            transition: 'color 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#111827')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
                    >
                        <ChevronLeft size={16} />
                        {isBuyNow ? 'Cancel & Go Back' : 'Return to Cart'}
                    </button>
                </div>

                {/* ──── RIGHT PANEL – Order Summary ──── */}
                <div className="checkout-right">
                    <div
                        style={{
                            backgroundColor: '#fafafa',
                            border: '1px solid #f3f4f6',
                            borderRadius: '1rem',
                            padding: '1.75rem',
                        }}
                        className="checkout-summary-card"
                    >
                        <h2
                            style={{
                                fontSize: '1.1rem',
                                fontWeight: 700,
                                color: '#111827',
                                marginBottom: '1.25rem',
                                paddingBottom: '0.75rem',
                                borderBottom: '1px solid #e5e7eb',
                            }}
                        >
                            Order Summary
                        </h2>

                        {/* Cart items */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
                            {checkoutItems.map((item) => (
                                <div
                                    key={`${item.productId}-${item.size}-${item.color || ''}`}
                                    style={{
                                        display: 'flex',
                                        gap: '0.85rem',
                                        alignItems: 'center',
                                    }}
                                >
                                    {/* Image with quantity badge */}
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                        <div
                                            style={{
                                                width: '3.5rem',
                                                height: '4.5rem',
                                                borderRadius: '0.4rem',
                                                overflow: 'hidden',
                                                backgroundColor: '#f3f4f6',
                                                border: '1px solid #e5e7eb',
                                            }}
                                        >
                                            {item.image ? (
                                                <CloudinaryImage
                                                    src={item.image}
                                                    alt={item?.name || "Product Image"}
                                                    preset="cartThumb"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                            ) : (
                                                <div
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#9ca3af',
                                                        fontSize: '1.2rem',
                                                    }}
                                                >
                                                    📷
                                                </div>
                                            )}
                                        </div>
                                        {/* Quantity badge */}
                                        <span
                                            style={{
                                                position: 'absolute',
                                                top: '-0.4rem',
                                                right: '-0.4rem',
                                                width: '1.3rem',
                                                height: '1.3rem',
                                                borderRadius: '50%',
                                                backgroundColor: '#EFBF04',
                                                color: '#fff',
                                                fontSize: '0.65rem',
                                                fontWeight: 700,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                lineHeight: 1,
                                            }}
                                        >
                                            {item.quantity}
                                        </span>
                                    </div>

                                    {/* Name + size */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p
                                            style={{
                                                fontSize: '0.88rem',
                                                fontWeight: 600,
                                                color: '#111827',
                                                lineHeight: 1.35,
                                                marginBottom: '0.15rem',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {item.name}
                                        </p>
                                        {item.size && (
                                            <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                                Size: <span style={{ color: '#6b7280' }}>{item.size}</span>
                                            </p>
                                        )}
                                        {item.color && (
                                            <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                                Color: <span style={{ color: '#6b7280' }}>{item.color}</span>
                                            </p>
                                        )}
                                    </div>

                                    {/* Price */}
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', flexShrink: 0 }}>
                                        {formatPrice(item.price * item.quantity)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Divider */}
                        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 1rem' }} />

                        {/* Subtotal */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '0.9rem',
                                color: '#6b7280',
                                marginBottom: '0.6rem',
                            }}
                        >
                            <span>Subtotal</span>
                            <span style={{ color: '#374151', fontWeight: 500 }}>{formatPrice(subtotal)}</span>
                        </div>

                        {/* Promo code */}
                        <div style={{ margin: '0.9rem 0' }}>
                            <PromoCodeInput checkoutItems={checkoutItems} disabled={placing} />
                            {promoError && (
                                <p
                                    role="alert"
                                    style={{
                                        fontSize: '0.75rem',
                                        color: '#ef4444',
                                        marginTop: '-0.5rem',
                                        marginBottom: '0.5rem',
                                        lineHeight: 1.4,
                                    }}
                                >
                                    {promoError}
                                </p>
                            )}
                        </div>

                        {/* Discount — only rendered when the server returned one */}
                        {discountAmount > 0 && (
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: '0.9rem',
                                    color: '#6b7280',
                                    marginBottom: '0.6rem',
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    Discount
                                    <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, letterSpacing: '0.04em' }}>
                                        ({appliedPromo.code})
                                    </span>
                                </span>
                                <span style={{ color: '#059669', fontWeight: 600 }}>
                                    −{formatPrice(discountAmount)}
                                </span>
                            </div>
                        )}

                        {/* Shipping */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '0.9rem',
                                color: '#6b7280',
                                marginBottom: '0.6rem',
                            }}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                Shipping
                                {shippingFetched && !shippingLoading && shippingService !== 'Flat Rate' && (
                                    <span
                                        style={{
                                            fontSize: '0.7rem',
                                            color: '#9ca3af',
                                            fontWeight: 400,
                                        }}
                                    >
                                        ({shippingService})
                                    </span>
                                )}
                            </span>
                            <span style={{ color: shippingKnown ? '#374151' : '#9ca3af', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: shippingKnown ? undefined : '0.78rem', fontStyle: shippingKnown ? undefined : 'italic' }}>
                                {shippingLoading ? (
                                    <Loader2 size={14} className="shipping-spinner" />
                                ) : shippingKnown ? (
                                    formatPrice(shippingCost)
                                ) : (
                                    'Enter address to calculate'
                                )}
                            </span>
                        </div>

                        {/* Divider */}
                        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '1rem 0' }} />

                        {/* Total */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '1.5rem',
                            }}
                        >
                            <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827' }}>Total</span>
                            <span style={{ fontSize: '1.35rem', fontWeight: 700, color: '#111827' }}>
                                {shippingLoading ? (
                                    <span style={{ fontSize: '0.9rem', color: '#9ca3af', fontWeight: 500 }}>Calculating…</span>
                                ) : shippingKnown ? (
                                    formatPrice(total)
                                ) : (
                                    <span style={{ fontSize: '0.9rem', color: '#9ca3af', fontWeight: 500 }}>—</span>
                                )}
                            </span>
                        </div>

                        {formError && (
                            <p role="alert" className="checkout-form-error">{formError}</p>
                        )}

                        {/* Pay Now Button — desktop/tablet. On phones the sticky bar below takes over. */}
                        {!isMobile && (
                            <button
                                type="submit"
                                disabled={payDisabled}
                                aria-describedby={isAdminAccount ? 'admin-order-block' : undefined}
                                className="checkout-pay-btn checkout-summary-pay"
                            >
                                {placing ? <Loader2 size={16} className="shipping-spinner" /> : <Lock size={16} strokeWidth={2.5} />}
                                {payLabel}
                            </button>
                        )}

                        {isAdminAccount ? (
                            <p
                                id="admin-order-block"
                                role="alert"
                                style={{
                                    fontSize: '0.78rem',
                                    color: '#b45309',
                                    textAlign: 'center',
                                    marginTop: '0.75rem',
                                    lineHeight: 1.5,
                                    fontWeight: 600,
                                }}
                            >
                                Admin accounts cannot place orders.
                            </p>
                        ) : (
                            <p
                                style={{
                                    fontSize: '0.73rem',
                                    color: '#9ca3af',
                                    textAlign: 'center',
                                    marginTop: '0.75rem',
                                    lineHeight: 1.5,
                                }}
                            >
                                Your payment information is secure
                            </p>
                        )}
                    </div>
                </div>
            </form>

            {/* ── Mobile sticky Pay bar ──
                Always reachable without scrolling past the order summary.
                Hidden while a field has focus, i.e. while the on-screen
                keyboard is up, so it never covers what is being typed. */}
            {isMobile && (
                <div
                    className={`checkout-mobile-cta${fieldFocused ? ' is-hidden' : ''}`}
                    aria-hidden={fieldFocused ? 'true' : undefined}
                >
                    <div className="checkout-mobile-cta-total">
                        <span>Total</span>
                        <strong>{totalLabel}</strong>
                    </div>
                    <button
                        type="submit"
                        form="checkout-form"
                        disabled={payDisabled}
                        tabIndex={fieldFocused ? -1 : undefined}
                        aria-describedby={isAdminAccount ? 'admin-order-block' : undefined}
                        className="checkout-pay-btn"
                    >
                        {placing ? <Loader2 size={16} className="shipping-spinner" /> : <Lock size={16} strokeWidth={2.5} />}
                        {!isAdminAccount && !shippingKnown && !shippingLoading ? 'Enter address' : payLabel}
                    </button>
                </div>
            )}

            <Footer />
        </div>
    );
};

export default CheckoutPage;
