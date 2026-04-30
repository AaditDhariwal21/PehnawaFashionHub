import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, X, ShoppingBag, Scale } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useCompare } from '../context/CompareContext';
import { useCart } from '../context/CartContext';
import formatPrice from '../utils/formatPrice';
import { startingPrice, defaultColor, totalStock as variantTotalStock } from '../utils/variants.js';
import { getDisplayImages } from '../utils/getDisplayImages';
import './ComparePage.css';

const API = import.meta.env.VITE_API_URL;

const ComparePage = () => {
    const navigate = useNavigate();
    const { compareItems, removeFromCompare, clearCompare } = useCompare();
    const { addToCart, openCart } = useCart();

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch full product data for each compared product ID
    useEffect(() => {
        if (compareItems.length === 0) {
            setProducts([]);
            setLoading(false);
            return;
        }

        const fetchProducts = async () => {
            setLoading(true);
            try {
                const results = await Promise.all(
                    compareItems.map((item) =>
                        fetch(`${API}/products/${item.productId}`)
                            .then((r) => r.json())
                            .then((d) => (d.success ? d.product : null))
                            .catch(() => null)
                    )
                );
                setProducts(results.filter(Boolean));
            } catch {
                setProducts([]);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, [compareItems]);

    /** Add product to cart with the first in-stock variant */
    const handleAddToCart = (product) => {
        const preferredColor = defaultColor(product);
        const variant =
            (product.variants || []).find((v) => v.color === preferredColor && v.stock > 0) ||
            (product.variants || []).find((v) => v.stock > 0);

        if (!variant) {
            navigate(`/product/${product._id}`);
            return;
        }

        const images = getDisplayImages(product, variant.color);
        const image = images[0]?.url || product.images?.[0]?.url || '';

        addToCart({
            productId: product._id,
            name: product.name,
            price: variant.price,
            image,
            size: variant.size,
            color: variant.color,
            quantity: 1,
        });
        openCart();
    };

    /* ───────────────── Loading ───────────────── */
    if (loading) {
        return (
            <div className="compare-page">
                <Navbar />
                <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 5rem)' }}>
                    <div className="flex flex-col items-center gap-4">
                        <div
                            className="rounded-full border-4 border-gray-200 animate-spin"
                            style={{ width: '3rem', height: '3rem', borderTopColor: '#EFBF04' }}
                        />
                        <p className="text-gray-500 text-sm">Loading comparison...</p>
                    </div>
                </div>
            </div>
        );
    }

    /* ───────────────── Empty State ───────────────── */
    if (products.length === 0) {
        return (
            <div className="compare-page flex flex-col min-h-screen">
                <Navbar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center text-center" style={{ maxWidth: '380px' }}>
                        <div
                            className="flex items-center justify-center rounded-full"
                            style={{
                                width: '7rem',
                                height: '7rem',
                                background: 'linear-gradient(145deg, #fef9e7, #fdf2d0)',
                                marginBottom: '1.75rem',
                            }}
                        >
                            <Scale className="w-8 h-8" strokeWidth={1.5} style={{ color: '#d4a904' }} />
                        </div>
                        <h2 className="font-bold text-gray-900" style={{ fontSize: '1.35rem', marginBottom: '0.6rem' }}>
                            No products to compare
                        </h2>
                        <p className="text-gray-400 leading-relaxed" style={{ fontSize: '0.9rem', marginBottom: '2rem' }}>
                            Add products to your compare list by tapping the compare icon on any product card.
                        </p>
                        <button
                            onClick={() => navigate('/')}
                            className="font-bold text-white rounded-lg cursor-pointer border-none transition-all hover:shadow-lg hover:opacity-95 active:scale-[0.98]"
                            style={{
                                padding: '0.85rem 2.5rem',
                                fontSize: '0.9rem',
                                background: 'linear-gradient(135deg, #EFBF04, #d4a904)',
                                letterSpacing: '0.03em',
                            }}
                        >
                            Explore Products
                        </button>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    /* ───────────────── Comparison Table ───────────────── */
    return (
        <div className="compare-page flex flex-col min-h-screen">
            <Navbar />

            {/* Breadcrumb */}
            <div className="border-b border-gray-100" style={{ padding: '0.75rem 2rem' }}>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-1 hover:text-gray-800 transition-colors cursor-pointer"
                    >
                        <ChevronLeft className="w-4 h-4" /> Home
                    </button>
                    <span>/</span>
                    <span className="text-gray-800 font-medium">Compare</span>
                </div>
            </div>

            {/* Header */}
            <div style={{ padding: '2rem 2rem 1rem' }}>
                <div className="flex items-baseline justify-between flex-wrap gap-2">
                    <div>
                        <h1 className="font-bold text-gray-900" style={{ fontSize: '2rem' }}>
                            Compare Products
                        </h1>
                        <p className="text-gray-500 text-sm" style={{ marginTop: '0.4rem' }}>
                            {products.length} {products.length === 1 ? 'product' : 'products'} selected
                        </p>
                    </div>
                    <button
                        onClick={() => { clearCompare(); navigate('/'); }}
                        className="text-sm font-medium cursor-pointer transition-colors"
                        style={{
                            background: 'none',
                            border: '1px solid #e5e7eb',
                            padding: '0.4rem 1rem',
                            borderRadius: '0.375rem',
                            color: '#6b7280',
                            fontFamily: 'inherit',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                    >
                        Clear All
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="compare-table-wrap flex-1">
                <table className="compare-table">
                    <tbody>
                        {/* ── Image Row ── */}
                        <tr>
                            <th>Product</th>
                            {products.map((p) => {
                                const images = getDisplayImages(p, p.colors?.[0]?.colorName || '');
                                const imgUrl = images[0]?.url || p.images?.[0]?.url;
                                return (
                                    <td key={p._id}>
                                        <div
                                            className="compare-table__img-wrap"
                                            onClick={() => navigate(`/product/${p._id}`)}
                                        >
                                            {imgUrl ? (
                                                <img src={imgUrl} alt={p.name} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <span style={{ fontSize: '3rem', color: '#d1d5db' }}>📷</span>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            className="compare-table__remove-btn"
                                            onClick={() => removeFromCompare(p._id)}
                                        >
                                            <X style={{ width: '0.7rem', height: '0.7rem' }} /> Remove
                                        </button>
                                    </td>
                                );
                            })}
                        </tr>

                        {/* ── Name ── */}
                        <tr>
                            <th>Name</th>
                            {products.map((p) => (
                                <td key={p._id}>
                                    <span
                                        className="font-semibold text-gray-900 cursor-pointer hover:text-gray-600 transition-colors"
                                        style={{ fontSize: '1rem' }}
                                        onClick={() => navigate(`/product/${p._id}`)}
                                    >
                                        {p.name}
                                    </span>
                                </td>
                            ))}
                        </tr>

                        {/* ── Price ── */}
                        <tr>
                            <th>Price</th>
                            {products.map((p) => {
                                const ep = startingPrice(p);
                                const discount = ep < (p.price || 0);
                                return (
                                    <td key={p._id}>
                                        <span className="compare-price">{formatPrice(ep)}</span>
                                        {discount && (
                                            <>
                                                <span className="compare-price__original">{formatPrice(p.price)}</span>
                                                <span className="compare-price__discount">
                                                    {Math.round((1 - ep / p.price) * 100)}% off
                                                </span>
                                            </>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>

                        {/* ── Category ── */}
                        <tr>
                            <th>Category</th>
                            {products.map((p) => (
                                <td key={p._id}>
                                    <span
                                        className="compare-attr-pill cursor-pointer"
                                        onClick={() => navigate(`/products/${p.category}`)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {p.category}
                                    </span>
                                </td>
                            ))}
                        </tr>

                        {/* ── Sizes ── */}
                        <tr>
                            <th>Sizes</th>
                            {products.map((p) => {
                                // Roll up max stock per size across all colors
                                const stockBySize = new Map();
                                for (const v of p.variants || []) {
                                    stockBySize.set(v.size, Math.max(stockBySize.get(v.size) || 0, v.stock));
                                }
                                const sizes = [...stockBySize.entries()];
                                return (
                                    <td key={p._id}>
                                        {sizes.length > 0 ? (
                                            <div className="flex flex-wrap">
                                                {sizes.map(([size, stock]) => (
                                                    <span
                                                        key={size}
                                                        className="compare-attr-pill"
                                                        style={{
                                                            opacity: stock === 0 ? 0.4 : 1,
                                                            textDecoration: stock === 0 ? 'line-through' : 'none',
                                                        }}
                                                    >
                                                        {size}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>—</span>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>

                        {/* ── Colors ── */}
                        <tr>
                            <th>Colors</th>
                            {products.map((p) => (
                                <td key={p._id}>
                                    {p.colors?.length > 0 ? (
                                        <div className="flex flex-wrap">
                                            {p.colors.map((c) => (
                                                <span key={c.colorName} className="compare-attr-pill">
                                                    {c.colorName}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>—</span>
                                    )}
                                </td>
                            ))}
                        </tr>

                        {/* ── Stock ── */}
                        <tr>
                            <th>Availability</th>
                            {products.map((p) => {
                                const stock = variantTotalStock(p);
                                return (
                                    <td key={p._id}>
                                        {stock === 0 ? (
                                            <span className="compare-stock--out">Out of Stock</span>
                                        ) : (
                                            <span className="compare-stock--in">
                                                In Stock — {stock} left
                                            </span>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>

                        {/* ── Weight ── */}
                        <tr>
                            <th>Weight</th>
                            {products.map((p) => (
                                <td key={p._id}>
                                    {p.weight > 0 ? (
                                        <span>{p.weight} lbs</span>
                                    ) : (
                                        <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>—</span>
                                    )}
                                </td>
                            ))}
                        </tr>

                        {/* ── Special Tag ── */}
                        <tr>
                            <th>Tag</th>
                            {products.map((p) => (
                                <td key={p._id}>
                                    {p.specialTag ? (
                                        <span
                                            className="text-xs font-bold uppercase tracking-wider text-white rounded-full"
                                            style={{
                                                padding: '0.3rem 0.75rem',
                                                background: 'linear-gradient(135deg, #EFBF04, #d4a904)',
                                                display: 'inline-block',
                                            }}
                                        >
                                            {p.specialTag}
                                        </span>
                                    ) : (
                                        <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>—</span>
                                    )}
                                </td>
                            ))}
                        </tr>

                        {/* ── Add to Cart ── */}
                        <tr>
                            <th>Action</th>
                            {products.map((p) => {
                                const outOfStock = variantTotalStock(p) === 0;
                                return (
                                <td key={p._id}>
                                    <button
                                        className="compare-table__cart-btn"
                                        onClick={() => handleAddToCart(p)}
                                        disabled={outOfStock}
                                        style={{
                                            opacity: outOfStock ? 0.5 : 1,
                                            cursor: outOfStock ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.4rem',
                                        }}
                                    >
                                        <ShoppingBag style={{ width: '0.9rem', height: '0.9rem' }} />
                                        {outOfStock ? 'Out of Stock' : 'Add to Cart'}
                                    </button>
                                </td>
                                );
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>

            <Footer />
        </div>
    );
};

export default ComparePage;
