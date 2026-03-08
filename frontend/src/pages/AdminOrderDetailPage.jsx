import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import formatPrice from '../utils/formatPrice';

const API = 'http://localhost:5000/api';

const STATUSES = ['Pending', 'Paid', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const STATUS_COLORS = {
    Pending: { bg: '#fef3c7', color: '#92400e' },
    Paid: { bg: '#d1fae5', color: '#065f46' },
    Processing: { bg: '#dbeafe', color: '#1e40af' },
    Shipped: { bg: '#e0e7ff', color: '#3730a3' },
    Delivered: { bg: '#d1fae5', color: '#065f46' },
    Cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

const AdminOrderDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [newStatus, setNewStatus] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const stored = localStorage.getItem('user');
        if (!token || !stored) { navigate('/signin'); return; }
        const parsed = JSON.parse(stored);
        if (parsed.role !== 'admin') { navigate('/'); return; }
        setUser(parsed);

        fetch(`${API}/orders/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((data) => {
                if (data.success) {
                    setOrder(data.order);
                    setNewStatus(data.order.orderStatus);
                } else navigate('/admin/orders');
            })
            .catch(() => navigate('/admin/orders'))
            .finally(() => setLoading(false));
    }, [id, navigate]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/orders/${id}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status: newStatus }),
            });
            const data = await res.json();
            if (data.success) {
                setOrder(data.order);
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
            }
        } catch (err) {
            console.error('Error updating status:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/');
    };

    if (!user || loading) {
        return (
            <div className="w-full h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: '#EFBF04' }}></div>
            </div>
        );
    }

    if (!order) return null;

    const sc = STATUS_COLORS[order.orderStatus] || STATUS_COLORS.Pending;

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
            {/* ── Header ── */}
            <header
                className="sticky top-0 z-40 w-full"
                style={{ backgroundColor: '#FFFFFF', borderBottom: '2px solid #FAD76C', boxShadow: '0 4px 20px rgba(250,215,108,0.3)' }}
            >
                <div className="w-full flex items-center justify-between" style={{ padding: '1.25rem 2.5rem' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center" style={{ borderColor: '#EFBF04' }}>
                            <span className="font-serif text-xl italic" style={{ color: '#EFBF04' }}>P</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Order Details</h1>
                            <p className="text-sm text-gray-500">Pehnawa</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-5">
                        <button
                            onClick={() => navigate('/admin/orders')}
                            className="text-sm font-medium cursor-pointer rounded-md"
                            style={{ padding: '10px 16px', border: '1.5px solid #e5e7eb', color: '#6b7280', backgroundColor: 'transparent' }}
                            onMouseEnter={(e) => { e.target.style.borderColor = '#EFBF04'; e.target.style.color = '#EFBF04'; }}
                            onMouseLeave={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.color = '#6b7280'; }}
                        >
                            ← All Orders
                        </button>
                        <button
                            onClick={handleLogout}
                            className="text-sm font-medium transition-all cursor-pointer rounded-md"
                            style={{ padding: '10px 16px', border: '1.5px solid #EFBF04', color: '#EFBF04', backgroundColor: 'transparent' }}
                            onMouseEnter={(e) => { e.target.style.backgroundColor = '#EFBF04'; e.target.style.color = '#FFFFFF'; }}
                            onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; e.target.style.color = '#EFBF04'; }}
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Main ── */}
            <main style={{ padding: '2.5rem 3rem', maxWidth: '1100px', margin: '0 auto' }}>
                {/* Order header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900" style={{ marginBottom: '0.25rem' }}>
                            {order.orderId}
                        </h2>
                        <p className="text-sm text-gray-500">
                            Placed on {new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                            {order.user && <> by <strong>{order.user.name}</strong> ({order.user.email})</>}
                        </p>
                    </div>
                    <span style={{
                        padding: '0.35rem 1rem', borderRadius: '999px',
                        fontSize: '0.78rem', fontWeight: 600,
                        backgroundColor: sc.bg, color: sc.color,
                    }}>
                        {order.orderStatus}
                    </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
                    {/* ── Left: Items + Totals ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Items card */}
                        <div style={{ background: '#fff', border: '2px solid #FAD76C', borderRadius: '1rem', padding: '1.75rem', boxShadow: '0 2px 12px rgba(250,215,108,0.15)' }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1.25rem', paddingBottom: '0.6rem', borderBottom: '1px solid #fde68a' }}>
                                Order Items
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {order.items.map((item, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                        <div style={{ width: '3.5rem', height: '4.5rem', borderRadius: '0.4rem', overflow: 'hidden', background: '#f3f4f6', border: '1px solid #e5e7eb', flexShrink: 0 }}>
                                            {item.image ? (
                                                <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '1.2rem' }}>📷</div>
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</p>
                                            {item.size && <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>Size: {item.size}</p>}
                                            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0.1rem 0 0' }}>Qty: {item.quantity}</p>
                                        </div>
                                        <span style={{ fontSize: '0.92rem', fontWeight: 600, flexShrink: 0 }}>{formatPrice(item.price * item.quantity)}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Totals */}
                            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #fde68a' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#6b7280', marginBottom: '0.45rem' }}>
                                    <span>Subtotal</span><span>{formatPrice(order.subtotal)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#6b7280', marginBottom: '0.45rem' }}>
                                    <span>Shipping</span><span>{formatPrice(order.shippingCost)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.05rem', color: '#111827', marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid #e5e7eb' }}>
                                    <span>Total</span><span>{formatPrice(order.totalAmount)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Right sidebar ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Update Status card */}
                        <div style={{ background: '#fff', border: '2px solid #FAD76C', borderRadius: '1rem', padding: '1.75rem', boxShadow: '0 2px 12px rgba(250,215,108,0.15)' }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1.25rem', paddingBottom: '0.6rem', borderBottom: '1px solid #fde68a' }}>
                                Update Status
                            </h3>
                            <select
                                value={newStatus}
                                onChange={(e) => setNewStatus(e.target.value)}
                                style={{
                                    width: '100%', padding: '0.7rem 0.9rem',
                                    border: '1px solid #e5e7eb', borderRadius: '0.5rem',
                                    fontSize: '0.9rem', fontFamily: 'inherit',
                                    color: '#111827', background: '#fff',
                                    outline: 'none', cursor: 'pointer',
                                    marginBottom: '1rem',
                                }}
                            >
                                {STATUSES.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                            <button
                                onClick={handleSave}
                                disabled={saving || newStatus === order.orderStatus}
                                style={{
                                    width: '100%', padding: '0.7rem',
                                    border: 'none', borderRadius: '0.5rem',
                                    background: (saving || newStatus === order.orderStatus) ? '#e5e7eb' : '#EFBF04',
                                    color: (saving || newStatus === order.orderStatus) ? '#9ca3af' : '#fff',
                                    fontSize: '0.9rem', fontWeight: 600,
                                    cursor: (saving || newStatus === order.orderStatus) ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit', transition: 'all 0.15s',
                                }}
                            >
                                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Status'}
                            </button>
                        </div>

                        {/* Shipping Address card */}
                        <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '1rem', padding: '1.75rem' }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1.25rem', paddingBottom: '0.6rem', borderBottom: '1px solid #f3f4f6' }}>
                                Shipping Address
                            </h3>
                            <div style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#374151' }}>
                                <p style={{ margin: 0, fontWeight: 600, color: '#111827' }}>{order.shippingAddress.fullName}</p>
                                <p style={{ margin: 0 }}>{order.shippingAddress.addressLine1}</p>
                                {order.shippingAddress.addressLine2 && <p style={{ margin: 0 }}>{order.shippingAddress.addressLine2}</p>}
                                <p style={{ margin: 0 }}>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zipCode}</p>
                                <p style={{ margin: 0 }}>{order.shippingAddress.country}</p>
                                <p style={{ margin: '0.5rem 0 0', color: '#6b7280' }}>📞 {order.shippingAddress.phone}</p>
                            </div>
                        </div>

                        {/* Payment card */}
                        <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '1rem', padding: '1.75rem' }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1.25rem', paddingBottom: '0.6rem', borderBottom: '1px solid #f3f4f6' }}>
                                Payment
                            </h3>
                            <div style={{ fontSize: '0.9rem', color: '#374151' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ color: '#6b7280' }}>Method</span>
                                    <span style={{ fontWeight: 500 }}>{order.paymentMethod || '—'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#6b7280' }}>Paid</span>
                                    <span style={{ fontWeight: 600, color: order.isPaid ? '#065f46' : '#991b1b' }}>
                                        {order.isPaid ? `Yes — ${new Date(order.paidAt).toLocaleDateString()}` : 'No'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminOrderDetailPage;
