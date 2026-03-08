import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import formatPrice from '../utils/formatPrice';
import './OrderDetailPage.css';

const API = 'http://localhost:5000/api';

const STATUS_COLORS = {
    Pending: { bg: '#fef3c7', color: '#92400e' },
    Paid: { bg: '#d1fae5', color: '#065f46' },
    Processing: { bg: '#dbeafe', color: '#1e40af' },
    Shipped: { bg: '#e0e7ff', color: '#3730a3' },
    Delivered: { bg: '#d1fae5', color: '#065f46' },
    Cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

const OrderDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/signin'); return; }

        fetch(`${API}/orders/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((data) => {
                if (data.success) setOrder(data.order);
                else navigate('/account');
            })
            .catch(() => navigate('/account'))
            .finally(() => setLoading(false));
    }, [id, navigate]);

    if (loading) {
        return (
            <div className="odp-page">
                <Navbar />
                <div className="odp-loading">Loading…</div>
                <Footer />
            </div>
        );
    }

    if (!order) return null;

    const sc = STATUS_COLORS[order.orderStatus] || STATUS_COLORS.Pending;

    return (
        <div className="odp-page">
            <Navbar />

            <div className="odp-container">
                {/* Back link */}
                <button className="odp-back" onClick={() => navigate('/account')}>
                    ← Back to Orders
                </button>

                {/* Header */}
                <div className="odp-header">
                    <div>
                        <h1>Order {order.orderId}</h1>
                        <p className="odp-date">
                            Placed on {new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                    <span className="odp-badge" style={{ backgroundColor: sc.bg, color: sc.color }}>
                        {order.orderStatus}
                    </span>
                </div>

                <div className="odp-grid">
                    {/* ── Items ── */}
                    <div className="odp-card">
                        <h2>Items</h2>
                        <div className="odp-items">
                            {order.items.map((item, i) => (
                                <div key={i} className="odp-item">
                                    <div className="odp-item-img-wrap">
                                        {item.image ? (
                                            <img src={item.image} alt={item.name} />
                                        ) : (
                                            <div className="odp-item-placeholder">📷</div>
                                        )}
                                    </div>
                                    <div className="odp-item-info">
                                        <p className="odp-item-name">{item.name}</p>
                                        {item.size && <p className="odp-item-size">Size: {item.size}</p>}
                                        <p className="odp-item-qty">Qty: {item.quantity}</p>
                                    </div>
                                    <span className="odp-item-price">{formatPrice(item.price * item.quantity)}</span>
                                </div>
                            ))}
                        </div>

                        {/* Totals */}
                        <div className="odp-totals">
                            <div className="odp-totals-row">
                                <span>Subtotal</span>
                                <span>{formatPrice(order.subtotal)}</span>
                            </div>
                            <div className="odp-totals-row">
                                <span>Shipping</span>
                                <span>{formatPrice(order.shippingCost)}</span>
                            </div>
                            <div className="odp-totals-row odp-totals-total">
                                <span>Total</span>
                                <span>{formatPrice(order.totalAmount)}</span>
                            </div>
                        </div>
                    </div>

                    {/* ── Shipping Address ── */}
                    <div className="odp-card">
                        <h2>Shipping Address</h2>
                        <div className="odp-address">
                            <p className="odp-addr-name">{order.shippingAddress.fullName}</p>
                            <p>{order.shippingAddress.addressLine1}</p>
                            {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                            <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zipCode}</p>
                            <p>{order.shippingAddress.country}</p>
                            <p className="odp-addr-phone">📞 {order.shippingAddress.phone}</p>
                        </div>
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default OrderDetailPage;
