import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';
import formatPrice from '../utils/formatPrice';

const CartDrawer = () => {
    const {
        cartItems,
        isCartOpen,
        justAdded,
        closeCart,
        removeFromCart,
        updateQuantity,
        getSubtotal,
        getTotalQuantity,
    } = useCart();

    const drawerRef = useRef(null);
    const navigate = useNavigate();

    // ESC key closes drawer
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') closeCart();
        };
        if (isCartOpen) {
            document.addEventListener('keydown', handleEsc);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = '';
        };
    }, [isCartOpen, closeCart]);

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) closeCart();
    };

    const subtotal = getSubtotal();
    const totalQty = getTotalQuantity();

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={handleBackdropClick}
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 100,
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    backdropFilter: 'blur(4px)',
                    WebkitBackdropFilter: 'blur(4px)',
                    opacity: isCartOpen ? 1 : 0,
                    pointerEvents: isCartOpen ? 'auto' : 'none',
                    transition: 'opacity 0.3s ease',
                }}
            />

            {/* Drawer */}
            <div
                ref={drawerRef}
                style={{
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 101,
                    width: 'min(400px, 100vw)',
                    backgroundColor: '#fff',
                    boxShadow: '-8px 0 30px rgba(0, 0, 0, 0.12)',
                    transform: isCartOpen ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* ─── Header ─── */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '1.25rem 1.5rem',
                        borderBottom: '1px solid #e5e7eb',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <ShoppingBag size={20} strokeWidth={1.8} />
                        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
                            Shopping Cart
                        </h2>
                        {totalQty > 0 && (
                            <span
                                style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    color: '#fff',
                                    backgroundColor: '#EFBF04',
                                    borderRadius: '9999px',
                                    padding: '0.15rem 0.5rem',
                                    lineHeight: '1.2',
                                }}
                            >
                                {totalQty}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={closeCart}
                        style={{
                            width: '2rem',
                            height: '2rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: '#6b7280',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f3f4f6';
                            e.currentTarget.style.color = '#111827';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = '#6b7280';
                        }}
                    >
                        <X size={18} strokeWidth={2} />
                    </button>
                </div>

                {/* ─── Body ─── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
                    {/* Success Banner */}
                    {justAdded && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.7rem 1rem',
                                marginBottom: '1rem',
                                backgroundColor: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: '0.5rem',
                                animation: 'fadeIn 0.3s ease',
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#15803d' }}>
                                Product added to cart successfully
                            </span>
                        </div>
                    )}
                    {cartItems.length === 0 ? (
                        /* ─── Empty State ─── */
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                                gap: '1rem',
                                color: '#9ca3af',
                            }}
                        >
                            <div
                                style={{
                                    width: '5rem',
                                    height: '5rem',
                                    borderRadius: '50%',
                                    backgroundColor: '#f9fafb',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <ShoppingBag size={32} strokeWidth={1.2} color="#d1d5db" />
                            </div>
                            <p style={{ fontSize: '0.95rem', fontWeight: 500, color: '#6b7280' }}>
                                Your cart is currently empty.
                            </p>
                            <button
                                onClick={closeCart}
                                style={{
                                    marginTop: '0.5rem',
                                    padding: '0.65rem 1.8rem',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: '#fff',
                                    background: 'linear-gradient(135deg, #EFBF04, #d4a904)',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    cursor: 'pointer',
                                    letterSpacing: '0.04em',
                                    transition: 'opacity 0.2s',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                            >
                                Continue Shopping
                            </button>
                        </div>
                    ) : (
                        /* ─── Cart Items ─── */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {cartItems.map((item) => (
                                <div
                                    key={`${item.productId}-${item.size}-${item.color || ''}`}
                                    style={{
                                        display: 'flex',
                                        gap: '1rem',
                                        padding: '1rem',
                                        borderRadius: '0.75rem',
                                        backgroundColor: '#fafafa',
                                        border: '1px solid #f3f4f6',
                                        transition: 'box-shadow 0.2s',
                                    }}
                                >
                                    {/* Thumbnail */}
                                    <div
                                        style={{
                                            width: '5rem',
                                            height: '6.5rem',
                                            borderRadius: '0.5rem',
                                            overflow: 'hidden',
                                            flexShrink: 0,
                                            backgroundColor: '#e5e7eb',
                                        }}
                                    >
                                        {item.image ? (
                                            <img
                                                src={item.image}
                                                alt={item.name}
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'cover',
                                                }}
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
                                                    fontSize: '1.5rem',
                                                }}
                                            >
                                                📷
                                            </div>
                                        )}
                                    </div>

                                    {/* Details */}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                        <div>
                                            <p
                                                style={{
                                                    fontSize: '0.9rem',
                                                    fontWeight: 600,
                                                    color: '#111827',
                                                    lineHeight: 1.3,
                                                    marginBottom: '0.2rem',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {item.name}
                                            </p>
                                            {item.size && (
                                                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.15rem' }}>
                                                    Size: <span style={{ fontWeight: 600 }}>{item.size}</span>
                                                </p>
                                            )}
                                            {item.color && (
                                                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                                    Color: <span style={{ fontWeight: 600 }}>{item.color}</span>
                                                </p>
                                            )}
                                            <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>
                                                {formatPrice(item.price)}
                                            </p>
                                        </div>

                                        {/* Quantity + Remove */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                            {/* Qty controls */}
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    border: '1px solid #e5e7eb',
                                                    borderRadius: '0.5rem',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <button
                                                    onClick={() => updateQuantity(item.productId, item.size, item.color || '', item.quantity - 1)}
                                                    disabled={item.quantity <= 1}
                                                    style={{
                                                        width: '2rem',
                                                        height: '2rem',
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
                                                        width: '2.2rem',
                                                        textAlign: 'center',
                                                        fontSize: '0.85rem',
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
                                                        width: '2rem',
                                                        height: '2rem',
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

                                            {/* Remove */}
                                            <button
                                                onClick={() => removeFromCart(item.productId, item.size, item.color || '')}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem',
                                                    border: 'none',
                                                    backgroundColor: 'transparent',
                                                    color: '#ef4444',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 500,
                                                    cursor: 'pointer',
                                                    padding: '0.3rem 0.5rem',
                                                    borderRadius: '0.3rem',
                                                    transition: 'background-color 0.15s',
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = '#fef2f2';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                }}
                                            >
                                                <Trash2 size={13} />
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ─── Footer ─── */}
                {cartItems.length > 0 && (
                    <div
                        style={{
                            padding: '1.25rem 1.5rem',
                            borderTop: '1px solid #e5e7eb',
                            backgroundColor: '#fff',
                        }}
                    >
                        {/* Subtotal */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '1rem',
                            }}
                        >
                            <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#374151' }}>
                                Subtotal
                            </span>
                            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>
                                {formatPrice(subtotal)}
                            </span>
                        </div>

                        {/* View Cart Button */}
                        <button
                            onClick={() => {
                                closeCart();
                                navigate('/cart');
                            }}
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
                            View Cart
                        </button>
                    </div>
                )}
            </div>
        </>
    );
};

export default CartDrawer;
