import formatPrice from '../utils/formatPrice';
import CloudinaryImage from './CloudinaryImage.jsx';
import '../pages/OrderConfirmationPage.css';

const STATUS_COLORS = {
    Pending: { bg: '#fef3c7', color: '#92400e' },
    Paid: { bg: '#d1fae5', color: '#065f46' },
    Processing: { bg: '#dbeafe', color: '#1e40af' },
    Shipped: { bg: '#e0e7ff', color: '#3730a3' },
    Delivered: { bg: '#d1fae5', color: '#065f46' },
    Cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

/**
 * An order's meta row, items, totals and shipping address — shared by the
 * order confirmation page and the guest order details page (OrderLookupPage).
 *
 * Works with both a full order document (account customers) and the
 * whitelisted guest view, which may be `limitedView` (order number + email
 * lookup: no street address, postcode or phone).
 */
const OrderReceipt = ({ order }) => {
    const sc = STATUS_COLORS[order.orderStatus] || STATUS_COLORS.Paid;
    const addr = order.shippingAddress || {};
    const limited = !!order.limitedView;

    return (
        <>
            {/* ── Order Info Row ── */}
            <div className="ocp-meta-row">
                <div className="ocp-meta-item">
                    <span className="ocp-meta-label">Order ID</span>
                    <span className="ocp-meta-value" style={{ overflowWrap: 'anywhere' }}>{order.orderId}</span>
                </div>
                <div className="ocp-meta-item">
                    <span className="ocp-meta-label">Order Date</span>
                    <span className="ocp-meta-value">
                        {new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                </div>
                <div className="ocp-meta-item">
                    <span className="ocp-meta-label">Order Status</span>
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
                        {(order.items || []).map((item, i) => (
                            <div key={i} className="ocp-item">
                                <CloudinaryImage src={item.image} alt={item?.name || "Product Image"} preset="cartThumb" className="ocp-item-img" />
                                <div className="ocp-item-info">
                                    <p className="ocp-item-name">{item.name}</p>
                                    {item.color && <p className="ocp-item-size">Color: {item.color}</p>}
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
                        {order.discountAmount > 0 && (
                            <div className="ocp-total-row">
                                <span>Discount{(order.promo?.code || order.promoCode) ? ` (${order.promo?.code || order.promoCode})` : ''}</span>
                                <span style={{ color: '#059669' }}>−{formatPrice(order.discountAmount)}</span>
                            </div>
                        )}
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
                        {!limited && <p>{addr.addressLine1}</p>}
                        {!limited && addr.addressLine2 && <p>{addr.addressLine2}</p>}
                        <p>{[addr.city, addr.state].filter(Boolean).join(', ')}{!limited && addr.zipCode ? ` ${addr.zipCode}` : ''}</p>
                        <p>{addr.country}</p>
                        {!limited && addr.phone && <p className="ocp-addr-phone">📞 {addr.phone}</p>}
                        {limited && (
                            <p style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.5 }}>
                                Full address hidden. Open your private order link to see every detail.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default OrderReceipt;
