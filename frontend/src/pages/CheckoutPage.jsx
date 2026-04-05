import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Lock, Loader2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import formatPrice from '../utils/formatPrice';
import './CheckoutPage.css';

const FALLBACK_SHIPPING = 8;
const API = import.meta.env.VITE_API_URL;

const REQUIRED_FIELDS = [
    { key: 'fullName', label: 'Full Name' },
    { key: 'contactNumber', label: 'Contact Number' },
    { key: 'street', label: 'Address Line 1' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'zip', label: 'ZIP Code' },
];

const CheckoutPage = () => {
    const navigate = useNavigate();
    const { cartItems, getSubtotal, clearCart, buyNowItem, clearBuyNowItem } = useCart();
    const { user } = useAuth();
    const [placing, setPlacing] = useState(false);
    const [errors, setErrors] = useState({});

    /* ── Shipping rate state ── */
    const [shippingCost, setShippingCost] = useState(null);
    const [shippingService, setShippingService] = useState('Flat Rate');
    const [shippingLoading, setShippingLoading] = useState(false);
    const [shippingFetched, setShippingFetched] = useState(false);

    /* ── Determine checkout mode ── */
    const isBuyNow = !!buyNowItem;
    const checkoutItems = isBuyNow ? [buyNowItem] : cartItems;

    const subtotal = isBuyNow
        ? buyNowItem.price * buyNowItem.quantity
        : getSubtotal();
    const shippingKnown = shippingCost !== null;
    const total = subtotal + (shippingKnown ? shippingCost : 0);

    /* ── Abort controller ref to cancel in-flight requests ── */
    const abortRef = useRef(null);
    const autofilled = useRef(false);

    const [form, setForm] = useState({
        fullName: '',
        contactNumber: '',
        street: '',
        apartment: '',
        city: '',
        state: '',
        zip: '',
        country: 'United States',
    });

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

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    };

    /* ── Fetch live shipping rate from Shippo ── */
    const fetchShippingRate = useCallback(async (formData) => {
        const { street, city, state, zip, fullName, contactNumber } = formData;

        /* Only call when all address fields are populated and ZIP is at least 5 chars */
        if (!street?.trim() || !city?.trim() || !state?.trim() || !zip?.trim() || zip.trim().length < 5) {
            return;
        }

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
            setShippingLoading(false);
            setShippingFetched(true);
        }
    }, [checkoutItems]);

    /* ── Trigger shipping rate fetch on ZIP blur ── */
    const handleZipBlur = () => {
        fetchShippingRate(form);
    };

    const validate = () => {
        const errs = {};
        for (const { key, label } of REQUIRED_FIELDS) {
            if (!form[key]?.trim()) errs[key] = `${label} is required`;
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handlePayNow = async (e) => {
        e.preventDefault();

        if (!user) { navigate('/signin'); return; }
        if (!validate()) return;

        /* If shipping hasn't been calculated yet, fetch it first */
        if (!shippingKnown) {
            fetchShippingRate(form);
            return;
        }

        setPlacing(true);

        try {
            const token = localStorage.getItem('token');

            const shippingAddress = {
                fullName: form.fullName,
                phone: form.contactNumber,
                addressLine1: form.street,
                addressLine2: form.apartment,
                city: form.city,
                state: form.state,
                zipCode: form.zip,
                country: form.country,
            };

            const res = await fetch(`${API}/payments/create-checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    cartItems: checkoutItems.map((ci) => ({
                        productId: ci.productId,
                        image: ci.image || '',
                        size: ci.size || '',
                        color: ci.color || '',
                        quantity: ci.quantity,
                    })),
                    shippingAddress,
                    shippingCost,
                }),
            });

            const data = await res.json();

            if (data.success && data.checkoutUrl) {
                if (data.squareOrderId) {
                    sessionStorage.setItem('pehnawa_squareOrderId', data.squareOrderId);
                }
                window.location.href = data.checkoutUrl;
            } else {
                alert(data.message || 'Failed to create checkout session.');
            }
        } catch (err) {
            console.error('Checkout error:', err);
            alert('Something went wrong. Please try again.');
        } finally {
            setPlacing(false);
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

    return (
        <div className="checkout-page">
            <Navbar />

            {/* Header */}
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 2rem 0' }}>
                <h1
                    style={{
                        fontSize: '2rem',
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
            <form onSubmit={handlePayNow} className="checkout-container">
                {/* ──── LEFT PANEL – Customer Details ──── */}
                <div className="checkout-left">
                    {/* Contact Section */}
                    <h2
                        style={{
                            fontSize: '1.15rem',
                            fontWeight: 700,
                            color: '#111827',
                            marginBottom: '1.25rem',
                            paddingBottom: '0.6rem',
                            borderBottom: '1px solid #e5e7eb',
                        }}
                    >
                        Contact Information
                    </h2>

                    <div style={{ marginBottom: '1.1rem' }}>
                        <Label htmlFor="fullName" required>Full Name</Label>
                        <input
                            id="fullName"
                            name="fullName"
                            type="text"
                            className={`checkout-input${errors.fullName ? ' input-error' : ''}`}
                            placeholder="John Doe"
                            value={form.fullName}
                            onChange={handleChange}
                        />
                        {errors.fullName && <span className="field-error">{errors.fullName}</span>}
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                        <Label htmlFor="contactNumber" required>Contact Number</Label>
                        <input
                            id="contactNumber"
                            name="contactNumber"
                            type="tel"
                            className={`checkout-input${errors.contactNumber ? ' input-error' : ''}`}
                            placeholder="+1 (555) 000-0000"
                            value={form.contactNumber}
                            onChange={handleChange}
                        />
                        {errors.contactNumber && <span className="field-error">{errors.contactNumber}</span>}
                    </div>

                    {/* Address Section */}
                    <h2
                        style={{
                            fontSize: '1.15rem',
                            fontWeight: 700,
                            color: '#111827',
                            marginBottom: '1.25rem',
                            paddingBottom: '0.6rem',
                            borderBottom: '1px solid #e5e7eb',
                        }}
                    >
                        Shipping Address
                    </h2>

                    <div style={{ marginBottom: '1.1rem' }}>
                        <Label htmlFor="street" required>Street Address</Label>
                        <input
                            id="street"
                            name="street"
                            type="text"
                            className={`checkout-input${errors.street ? ' input-error' : ''}`}
                            placeholder="123 Main Street"
                            value={form.street}
                            onChange={handleChange}
                        />
                        {errors.street && <span className="field-error">{errors.street}</span>}
                    </div>

                    <div style={{ marginBottom: '1.1rem' }}>
                        <Label htmlFor="apartment">Apartment / Suite</Label>
                        <input
                            id="apartment"
                            name="apartment"
                            type="text"
                            className="checkout-input"
                            placeholder="Apt 4B (optional)"
                            value={form.apartment}
                            onChange={handleChange}
                        />
                    </div>

                    <div className="checkout-row" style={{ marginBottom: '1.1rem' }}>
                        <div>
                            <Label htmlFor="city" required>City</Label>
                            <input
                                id="city"
                                name="city"
                                type="text"
                                className={`checkout-input${errors.city ? ' input-error' : ''}`}
                                placeholder="New York"
                                value={form.city}
                                onChange={handleChange}
                            />
                            {errors.city && <span className="field-error">{errors.city}</span>}
                        </div>
                        <div>
                            <Label htmlFor="state" required>State</Label>
                            <input
                                id="state"
                                name="state"
                                type="text"
                                className={`checkout-input${errors.state ? ' input-error' : ''}`}
                                placeholder="NY"
                                value={form.state}
                                onChange={handleChange}
                            />
                            {errors.state && <span className="field-error">{errors.state}</span>}
                        </div>
                    </div>

                    <div className="checkout-row" style={{ marginBottom: '1.1rem' }}>
                        <div>
                            <Label htmlFor="zip" required>ZIP Code</Label>
                            <input
                                id="zip"
                                name="zip"
                                type="text"
                                className={`checkout-input${errors.zip ? ' input-error' : ''}`}
                                placeholder="10001"
                                value={form.zip}
                                onChange={handleChange}
                                onBlur={handleZipBlur}
                            />
                            {errors.zip && <span className="field-error">{errors.zip}</span>}
                        </div>
                        <div>
                            <Label htmlFor="country">Country</Label>
                            <select
                                id="country"
                                name="country"
                                className="checkout-select"
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
                                                <img
                                                    src={item.image}
                                                    alt={item.name}
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

                        {/* Pay Now Button */}
                        <button
                            type="submit"
                            disabled={placing || shippingLoading || !shippingKnown}
                            style={{
                                width: '100%',
                                padding: '0.9rem',
                                fontSize: '0.95rem',
                                fontWeight: 700,
                                color: '#fff',
                                background: (placing || shippingLoading || !shippingKnown) ? '#d1d5db' : 'linear-gradient(135deg, #EFBF04, #d4a904)',
                                border: 'none',
                                borderRadius: '0.6rem',
                                cursor: (placing || shippingLoading || !shippingKnown) ? 'not-allowed' : 'pointer',
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                fontFamily: 'inherit',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => { if (!placing && !shippingLoading && shippingKnown) { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(239, 191, 4, 0.4)'; } }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            <Lock size={16} strokeWidth={2.5} />
                            {placing ? 'Placing Order…' : 'Pay Now'}
                        </button>

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
                    </div>
                </div>
            </form>

            <Footer />
        </div>
    );
};

export default CheckoutPage;
