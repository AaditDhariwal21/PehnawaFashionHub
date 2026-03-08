import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import formatPrice from '../utils/formatPrice';
import './OrderConfirmationPage.css';

const API = 'https://pehnawafashionhub.onrender.com/api';

const STATUS_COLORS = {
    Pending: { bg: '#fef3c7', color: '#92400e' },
    Paid: { bg: '#d1fae5', color: '#065f46' },
    Processing: { bg: '#dbeafe', color: '#1e40af' },
    Shipped: { bg: '#e0e7ff', color: '#3730a3' },
    Delivered: { bg: '#d1fae5', color: '#065f46' },
    Cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

const OrderConfirmationPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { clearCart, clearBuyNowItem } = useCart();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const confirmedRef = useRef(false);

    useEffect(() => {
        if (!user) { navigate('/signin'); return; }
        if (confirmedRef.current) return;

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

        const MAX_POLLS = 5;
        const POLL_INTERVAL = 3000; // 3 seconds

        const pollForOrder = async (attempt = 1) => {
            try {
                const res = await fetch(`${API}/orders/latest-paid`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();

                if (data.success && data.order) {
                    clearCart();
                    clearBuyNowItem();
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
                const res = await fetch(`${API}/orders/verify-square-payment`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                });
                const data = await res.json();

                if (data.success && data.order) {
                    clearCart();
                    clearBuyNowItem();
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
    }, [id, user, navigate, clearCart]);

    /* ─── Loading State ─── */
    if (loading) {
        return (
            <div className="ocp">
                <Navbar />
                <div className="ocp-wrapper" style={{ textAlign: 'center', paddingTop: '4rem', minHeight: '50vh' }}>
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
    const sc = STATUS_COLORS[order.orderStatus] || STATUS_COLORS.Paid;
    const addr = order.shippingAddress || {};

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

                {/* ── Order Info Row ── */}
                <div className="ocp-meta-row">
                    <div className="ocp-meta-item">
                        <span className="ocp-meta-label">Order ID</span>
                        <span className="ocp-meta-value">{order.orderId}</span>
                    </div>
                    <div className="ocp-meta-item">
                        <span className="ocp-meta-label">Order Date</span>
                        <span className="ocp-meta-value">
                            {new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                    </div>
                    <div className="ocp-meta-item">
                        <span className="ocp-meta-label">Payment Status</span>
                        <span className="ocp-status-badge" style={{ backgroundColor: sc.bg, color: sc.color }}>
                            {order.orderStatus}
                        </span>
                    </div>
                </div>

                {/* ── Two-column: Items + Shipping ── */}
                <div className="ocp-grid">
                    {/* Items Ordered */}
                    <div className="ocp-card">
                        <h2 className="ocp-card-title">Items Ordered</h2>
                        <div className="ocp-items">
                            {order.items.map((item, i) => (
                                <div key={i} className="ocp-item">
                                    <img src={item.image} alt={item.name} className="ocp-item-img" />
                                    <div className="ocp-item-info">
                                        <p className="ocp-item-name">{item.name}</p>
                                        {item.size && <p className="ocp-item-size">Size: {item.size}</p>}
                                        <p className="ocp-item-qty">Qty: {item.quantity}</p>
                                    </div>
                                    <span className="ocp-item-price">{formatPrice(item.price * item.quantity)}</span>
                                </div>
                            ))}
                        </div>

                        {/* Totals */}
                        <div className="ocp-totals">
                            <div className="ocp-total-row">
                                <span>Subtotal</span>
                                <span>{formatPrice(order.subtotal)}</span>
                            </div>
                            <div className="ocp-total-row">
                                <span>Shipping</span>
                                <span>{formatPrice(order.shippingCost)}</span>
                            </div>
                            <div className="ocp-total-row ocp-total-final">
                                <span>Total Paid</span>
                                <span>{formatPrice(order.totalAmount)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Shipping Address */}
                    <div className="ocp-card">
                        <h2 className="ocp-card-title">Shipping Address</h2>
                        <div className="ocp-addr">
                            <p className="ocp-addr-name">{addr.fullName}</p>
                            <p>{addr.addressLine1}</p>
                            {addr.addressLine2 && <p>{addr.addressLine2}</p>}
                            <p>{addr.city}, {addr.state} {addr.zipCode}</p>
                            <p>{addr.country}</p>
                            {addr.phone && <p className="ocp-addr-phone">📞 {addr.phone}</p>}
                        </div>
                    </div>
                </div>

                {/* ── Action Buttons ── */}
                <div className="ocp-actions">
                    <button className="ocp-btn-primary" onClick={() => navigate('/account', { state: { tab: 'orders' } })}>
                        View Your Orders
                    </button>
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
