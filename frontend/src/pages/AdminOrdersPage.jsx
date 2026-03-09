import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import formatPrice from '../utils/formatPrice';

const API = import.meta.env.VITE_API_URL;

const STATUS_COLORS = {
    Pending: { bg: '#fef3c7', color: '#92400e' },
    Paid: { bg: '#d1fae5', color: '#065f46' },
    Processing: { bg: '#dbeafe', color: '#1e40af' },
    Shipped: { bg: '#e0e7ff', color: '#3730a3' },
    Delivered: { bg: '#d1fae5', color: '#065f46' },
    Cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

const AdminOrdersPage = () => {
    const [user, setUser] = useState(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const token = localStorage.getItem('token');
        const stored = localStorage.getItem('user');
        if (!token || !stored) { navigate('/signin'); return; }
        const parsed = JSON.parse(stored);
        if (parsed.role !== 'admin') { navigate('/'); return; }
        setUser(parsed);

        fetch(`${API}/orders`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((data) => { if (data.success) setOrders(data.orders); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/');
    };

    if (!user) {
        return (
            <div className="w-full h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: '#EFBF04' }}></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
            {/* ── Header (matches AdminDashboard) ── */}
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
                            <h1 className="text-xl font-bold text-gray-900">All Orders</h1>
                            <p className="text-sm text-gray-500">Pehnawa</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-5">
                        <button
                            onClick={() => navigate('/adminDashboard')}
                            className="text-sm font-medium cursor-pointer rounded-md"
                            style={{ padding: '10px 16px', border: '1.5px solid #e5e7eb', color: '#6b7280', backgroundColor: 'transparent' }}
                            onMouseEnter={(e) => { e.target.style.borderColor = '#EFBF04'; e.target.style.color = '#EFBF04'; }}
                            onMouseLeave={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.color = '#6b7280'; }}
                        >
                            ← Dashboard
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

            {/* ── Content ── */}
            <main style={{ padding: '2.5rem 3rem' }}>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                    Manage <span style={{ color: '#EFBF04' }}>Orders</span>
                </h2>
                <p className="text-sm text-gray-500 mb-6">View and manage all customer orders.</p>

                {loading ? (
                    <p style={{ textAlign: 'center', color: '#9ca3af', padding: '4rem 0' }}>Loading orders…</p>
                ) : orders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem 0', color: '#9ca3af' }}>
                        <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>No orders yet</p>
                        <p style={{ fontSize: '0.9rem' }}>Orders placed by customers will appear here.</p>
                    </div>
                ) : (
                    <div style={{ backgroundColor: '#fff', borderRadius: '1rem', border: '2px solid #FAD76C', overflow: 'hidden', boxShadow: '0 2px 12px rgba(250,215,108,0.15)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                                    <th style={thStyle}>Order ID</th>
                                    <th style={{ ...thStyle, width: '70px' }}>Item</th>
                                    <th style={thStyle}>Customer</th>
                                    <th style={thStyle}>Total</th>
                                    <th style={thStyle}>Status</th>
                                    <th style={thStyle}>Date</th>
                                    <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((order) => {
                                    const sc = STATUS_COLORS[order.orderStatus] || STATUS_COLORS.Pending;
                                    const firstItem = order.items?.[0];
                                    const extraCount = (order.items?.length || 1) - 1;
                                    return (
                                        <tr key={order._id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fffdf5')}
                                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                        >
                                            <td style={tdStyle}>
                                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{order.orderId}</span>
                                            </td>
                                            <td style={{ ...tdStyle, width: '70px' }}>
                                                <div style={{ position: 'relative', width: '50px', height: '50px' }}>
                                                    {firstItem?.image ? (
                                                        <img
                                                            src={firstItem.image}
                                                            alt={firstItem.name || 'Product'}
                                                            style={{
                                                                width: '50px', height: '50px', borderRadius: '0.5rem',
                                                                objectFit: 'cover', border: '1px solid #f3f4f6',
                                                            }}
                                                        />
                                                    ) : (
                                                        <div style={{
                                                            width: '50px', height: '50px', borderRadius: '0.5rem',
                                                            backgroundColor: '#f9fafb', border: '1px solid #f3f4f6',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            <span style={{ fontSize: '1.2rem' }}>📦</span>
                                                        </div>
                                                    )}
                                                    {extraCount > 0 && (
                                                        <span style={{
                                                            position: 'absolute', bottom: '-4px', right: '-4px',
                                                            backgroundColor: '#EFBF04', color: '#fff',
                                                            fontSize: '0.65rem', fontWeight: 700,
                                                            borderRadius: '999px', padding: '1px 5px',
                                                            border: '2px solid #fff', lineHeight: '1.3',
                                                        }}>
                                                            +{extraCount}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={tdStyle}>{order.user?.name || '—'}</td>
                                            <td style={tdStyle}>{formatPrice(order.totalAmount)}</td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    padding: '0.25rem 0.75rem', borderRadius: '999px',
                                                    fontSize: '0.75rem', fontWeight: 600,
                                                    backgroundColor: sc.bg, color: sc.color,
                                                }}>
                                                    {order.orderStatus}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>
                                                {new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                <button
                                                    onClick={() => navigate(`/admin/orders/${order._id}`)}
                                                    style={{
                                                        padding: '0.35rem 1rem', border: '1.5px solid #EFBF04',
                                                        borderRadius: '0.4rem', background: 'transparent',
                                                        color: '#EFBF04', fontWeight: 600, fontSize: '0.8rem',
                                                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                                    }}
                                                    onMouseEnter={(e) => { e.target.style.backgroundColor = '#EFBF04'; e.target.style.color = '#fff'; }}
                                                    onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; e.target.style.color = '#EFBF04'; }}
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
};

/* ── Shared styles ── */
const thStyle = { textAlign: 'left', padding: '0.85rem 1.25rem', fontSize: '0.78rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdStyle = { padding: '0.85rem 1.25rem', fontSize: '0.88rem', color: '#374151' };

export default AdminOrdersPage;
