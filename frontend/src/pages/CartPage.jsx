import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useCart } from '../context/CartContext';
import { useCompare } from '../context/CompareContext';
import formatPrice from '../utils/formatPrice';

const CartPage = () => {
    const navigate = useNavigate();
    const { cartItems, removeFromCart, updateQuantity, getSubtotal, getTotalQuantity } = useCart();
    const { compareCount } = useCompare();

    const subtotal = getSubtotal();
    const totalQty = getTotalQuantity();

    // Sticky mobile checkout bar: show it only while the order-summary card is
    // scrolled out of view (avoids a duplicate CTA when the summary is on screen).
    const summaryRef = useRef(null);
    const [stickyVisible, setStickyVisible] = useState(false);
    useEffect(() => {
        const el = summaryRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => setStickyVisible(!entry.isIntersecting),
            { rootMargin: '0px 0px -120px 0px' }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [cartItems.length]);

    /* ─────────── Empty Cart ─────────── */
    if (cartItems.length === 0) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#fff' }}>
                <Navbar />
                <div
                    style={{
                        maxWidth: '1200px',
                        margin: '0 auto',
                        padding: '3rem 2rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '1.25rem',
                    }}
                >
                    <div
                        style={{
                            width: '6rem',
                            height: '6rem',
                            borderRadius: '50%',
                            backgroundColor: '#f9fafb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: '4rem',
                        }}
                    >
                        <ShoppingBag size={36} strokeWidth={1.2} color="#d1d5db" />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
                        Your cart is empty
                    </h1>
                    <p style={{ fontSize: '0.95rem', color: '#6b7280', textAlign: 'center' }}>
                        Looks like you haven't added anything to your cart yet.
                    </p>
                    <button
                        onClick={() => navigate('/')}
                        style={{
                            marginTop: '0.5rem',
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
            </div>
        );
    }

    const imageEl = (item, w, h) => (
        <div
            style={{
                width: w,
                height: h,
                borderRadius: '0.5rem',
                overflow: 'hidden',
                flexShrink: 0,
                backgroundColor: '#f3f4f6',
                cursor: 'pointer',
            }}
            onClick={() => navigate(`/product/${item.productId}`)}
        >
            {item.image ? (
                <img src={item.image} alt={item?.name || 'Product Image'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '1.5rem' }}>📷</div>
            )}
        </div>
    );

    /* ─────────── Cart with items ─────────── */
    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#fff' }}>
            <Navbar />

            {/* Header */}
            <div className="px-4 md:px-8 pt-8" style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <h1
                    className="text-[1.5rem] md:text-[2rem]"
                    style={{ fontWeight: 700, color: '#111827', textAlign: 'center', marginBottom: '0.5rem' }}
                >
                    Shopping Cart
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
                    <span style={{ color: '#6b7280' }}>Your Shopping Cart</span>
                </div>
            </div>

            {/* Main content – 2-column on desktop, stacked on mobile */}
            <div
                className="flex flex-col md:flex-row gap-6 md:gap-10 px-4 md:px-8 pb-24 md:pb-16 items-start"
                style={{ maxWidth: '1200px', margin: '0 auto' }}
            >
                {/* ═══════ LEFT — Cart Items ═══════ */}
                <div className="w-full md:flex-1 min-w-0">
                    {/* Table header — desktop only */}
                    <div
                        className="hidden md:grid"
                        style={{
                            gridTemplateColumns: '2fr 1fr 1fr 1fr',
                            gap: '1rem',
                            padding: '0.75rem 0',
                            borderBottom: '2px solid #e5e7eb',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: '#6b7280',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                        }}
                    >
                        <span>Product</span>
                        <span>Price</span>
                        <span>Quantity</span>
                        <span style={{ textAlign: 'right' }}>Total</span>
                    </div>

                    {/* Cart rows */}
                    {cartItems.map((item) => {
                        const lineTotal = item.price * item.quantity;
                        const rowKey = `${item.productId}-${item.size}-${item.color || ''}`;
                        return (
                            <div key={rowKey}>
                                {/* ─────── Desktop table row (unchanged layout) ─────── */}
                                <div
                                    className="hidden md:grid"
                                    style={{
                                        gridTemplateColumns: '2fr 1fr 1fr 1fr',
                                        gap: '1rem',
                                        alignItems: 'center',
                                        padding: '1.25rem 0',
                                        borderBottom: '1px solid #f3f4f6',
                                    }}
                                >
                                    {/* Product info */}
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        {imageEl(item, '5.5rem', '7rem')}
                                        <div>
                                            <p
                                                onClick={() => navigate(`/product/${item.productId}`)}
                                                style={{
                                                    fontSize: '0.95rem',
                                                    fontWeight: 600,
                                                    color: '#111827',
                                                    cursor: 'pointer',
                                                    marginBottom: '0.25rem',
                                                    lineHeight: 1.35,
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.color = '#EFBF04')}
                                                onMouseLeave={(e) => (e.currentTarget.style.color = '#111827')}
                                            >
                                                {item.name}
                                            </p>
                                            {item.size && (
                                                <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.2rem' }}>
                                                    Size: <span style={{ color: '#6b7280' }}>{item.size}</span>
                                                </p>
                                            )}
                                            {item.color && (
                                                <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.35rem' }}>
                                                    Color: <span style={{ color: '#6b7280' }}>{item.color}</span>
                                                </p>
                                            )}
                                            <button
                                                onClick={() => removeFromCart(item.productId, item.size, item.color || '')}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.25rem',
                                                    border: 'none',
                                                    backgroundColor: 'transparent',
                                                    color: '#ef4444',
                                                    fontSize: '0.78rem',
                                                    fontWeight: 500,
                                                    cursor: 'pointer',
                                                    padding: 0,
                                                    transition: 'opacity 0.15s',
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                                                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                                            >
                                                <Trash2 size={13} />
                                                Remove
                                            </button>
                                        </div>
                                    </div>

                                    {/* Price */}
                                    <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#374151' }}>
                                        {formatPrice(item.price)}
                                    </span>

                                    {/* Quantity stepper */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '0.5rem',
                                            overflow: 'hidden',
                                            width: 'fit-content',
                                        }}
                                    >
                                        <button
                                            onClick={() => updateQuantity(item.productId, item.size, item.color || '', item.quantity - 1)}
                                            disabled={item.quantity <= 1}
                                            style={{
                                                width: '2.2rem',
                                                height: '2.2rem',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                cursor: item.quantity <= 1 ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: item.quantity <= 1 ? '#d1d5db' : '#374151',
                                                transition: 'background-color 0.15s',
                                            }}
                                            onMouseEnter={(e) => {
                                                if (item.quantity > 1) e.currentTarget.style.backgroundColor = '#f3f4f6';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                            }}
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <span
                                            style={{
                                                width: '2.4rem',
                                                textAlign: 'center',
                                                fontSize: '0.9rem',
                                                fontWeight: 600,
                                                color: '#111827',
                                                userSelect: 'none',
                                            }}
                                        >
                                            {item.quantity}
                                        </span>
                                        <button
                                            onClick={() => updateQuantity(item.productId, item.size, item.color || '', item.quantity + 1)}
                                            style={{
                                                width: '2.2rem',
                                                height: '2.2rem',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#374151',
                                                transition: 'background-color 0.15s',
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.backgroundColor = '#f3f4f6';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                            }}
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>

                                    {/* Line total */}
                                    <span
                                        style={{
                                            fontSize: '1rem',
                                            fontWeight: 700,
                                            color: '#111827',
                                            textAlign: 'right',
                                        }}
                                    >
                                        {formatPrice(lineTotal)}
                                    </span>
                                </div>

                                {/* ─────── Mobile card row ─────── */}
                                <div
                                    className="flex md:hidden"
                                    style={{ gap: '0.9rem', padding: '1rem 0', borderBottom: '1px solid #f3f4f6' }}
                                >
                                    {imageEl(item, '5rem', '6.5rem')}
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <p
                                            onClick={() => navigate(`/product/${item.productId}`)}
                                            className="line-clamp-2"
                                            style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', lineHeight: 1.35, cursor: 'pointer' }}
                                        >
                                            {item.name}
                                        </p>
                                        {(item.size || item.color) && (
                                            <p style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                                                {item.size && <>Size: <span style={{ color: '#6b7280' }}>{item.size}</span></>}
                                                {item.size && item.color && <span> · </span>}
                                                {item.color && <>Color: <span style={{ color: '#6b7280' }}>{item.color}</span></>}
                                            </p>
                                        )}
                                        <p style={{ fontSize: '0.82rem', color: '#6b7280' }}>{formatPrice(item.price)} each</p>

                                        {/* Qty stepper + line total */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.25rem' }}>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    border: '1px solid #e5e7eb',
                                                    borderRadius: '0.5rem',
                                                    overflow: 'hidden',
                                                    width: 'fit-content',
                                                }}
                                            >
                                                <button
                                                    onClick={() => updateQuantity(item.productId, item.size, item.color || '', item.quantity - 1)}
                                                    disabled={item.quantity <= 1}
                                                    aria-label="Decrease quantity"
                                                    style={{
                                                        width: '2.75rem',
                                                        height: '2.75rem',
                                                        border: 'none',
                                                        backgroundColor: 'transparent',
                                                        cursor: item.quantity <= 1 ? 'not-allowed' : 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: item.quantity <= 1 ? '#d1d5db' : '#374151',
                                                    }}
                                                >
                                                    <Minus size={15} />
                                                </button>
                                                <span style={{ width: '2.2rem', textAlign: 'center', fontSize: '0.9rem', fontWeight: 600, color: '#111827', userSelect: 'none' }}>
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    onClick={() => updateQuantity(item.productId, item.size, item.color || '', item.quantity + 1)}
                                                    aria-label="Increase quantity"
                                                    style={{
                                                        width: '2.75rem',
                                                        height: '2.75rem',
                                                        border: 'none',
                                                        backgroundColor: 'transparent',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#374151',
                                                    }}
                                                >
                                                    <Plus size={15} />
                                                </button>
                                            </div>
                                            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                                                {formatPrice(lineTotal)}
                                            </span>
                                        </div>

                                        {/* Remove */}
                                        <button
                                            onClick={() => removeFromCart(item.productId, item.size, item.color || '')}
                                            className="min-h-11 -ml-1"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.3rem',
                                                border: 'none',
                                                backgroundColor: 'transparent',
                                                color: '#ef4444',
                                                fontSize: '0.8rem',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                padding: '0 0.25rem',
                                                alignSelf: 'flex-start',
                                            }}
                                        >
                                            <Trash2 size={14} />
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Continue shopping link */}
                    <button
                        onClick={() => navigate('/')}
                        className="min-h-11 md:min-h-0"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            marginTop: '1rem',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: '#6b7280',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            padding: 0,
                            transition: 'color 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#111827')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
                    >
                        <ChevronLeft size={16} />
                        Continue Shopping
                    </button>
                </div>

                {/* ═══════ RIGHT — Order Summary ═══════ */}
                <div ref={summaryRef} className="w-full md:w-80 md:flex-none md:sticky" style={{ top: '5.5rem' }}>
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

                        {/* Items count */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '0.9rem',
                                color: '#6b7280',
                                marginBottom: '0.6rem',
                            }}
                        >
                            <span>Items ({totalQty})</span>
                            <span style={{ color: '#374151', fontWeight: 500 }}>
                                {formatPrice(subtotal)}
                            </span>
                        </div>

                        {/* Divider */}
                        <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '1rem 0' }} />

                        {/* Subtotal */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '1.25rem',
                            }}
                        >
                            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                                Subtotal
                            </span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                                {formatPrice(subtotal)}
                            </span>
                        </div>

                        {/* Checkout button */}
                        <button
                            onClick={() => navigate('/checkout')}
                            style={{
                                width: '100%',
                                padding: '0.85rem',
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                color: '#fff',
                                background: 'linear-gradient(135deg, #EFBF04, #d4a904)',
                                border: 'none',
                                borderRadius: '0.6rem',
                                cursor: 'pointer',
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '0.9';
                                e.currentTarget.style.boxShadow = '0 4px 15px rgba(239, 191, 4, 0.4)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            Checkout
                        </button>

                        <p
                            style={{
                                fontSize: '0.75rem',
                                color: '#9ca3af',
                                textAlign: 'center',
                                marginTop: '0.75rem',
                            }}
                        >
                            Taxes calculated at checkout
                        </p>
                    </div>
                </div>
            </div>

            {/* ═══ Sticky mobile checkout bar (phones only) ═══
                Sits above the bottom nav; floats above the compare bar when it's
                showing; hidden while the order-summary card is on screen. */}
            <div
                className="md:hidden fixed left-0 right-0 flex items-center gap-3"
                style={{
                    bottom: compareCount > 0
                        ? 'calc(var(--pw-bottom-nav-h) + var(--pw-safe-bottom) + 4.75rem)'
                        : 'calc(var(--pw-bottom-nav-h) + var(--pw-safe-bottom))',
                    zIndex: 'var(--pw-z-fab)',
                    padding: '0.6rem 1rem',
                    backgroundColor: '#fff',
                    borderTop: '1px solid #e5e7eb',
                    boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
                    transform: stickyVisible ? 'translateY(0)' : 'translateY(130%)',
                    opacity: stickyVisible ? 1 : 0,
                    pointerEvents: stickyVisible ? 'auto' : 'none',
                    transition: 'transform 0.25s ease, opacity 0.25s ease',
                }}
            >
                <div className="flex flex-col flex-shrink-0">
                    <span style={{ fontSize: '0.68rem', color: '#9ca3af', lineHeight: 1.1 }}>Subtotal ({totalQty})</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', lineHeight: 1.15 }}>{formatPrice(subtotal)}</span>
                </div>
                <button
                    onClick={() => navigate('/checkout')}
                    className="flex-1"
                    style={{
                        padding: '0.85rem',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: '#fff',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        background: 'linear-gradient(135deg, #EFBF04, #d4a904)',
                        border: 'none',
                        borderRadius: '0.6rem',
                        cursor: 'pointer',
                    }}
                >
                    Checkout
                </button>
            </div>
        </div>
    );
};

export default CartPage;
