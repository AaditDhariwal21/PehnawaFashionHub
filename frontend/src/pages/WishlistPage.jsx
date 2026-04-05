import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, ShoppingBag, X, ChevronLeft } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';
import formatPrice from '../utils/formatPrice';
import { getEffectivePrice, shouldShowDiscount } from '../utils/getEffectivePrice';
import { getDisplayImages } from '../utils/getDisplayImages';

const API = import.meta.env.VITE_API_URL;

const WishlistPage = () => {
    const navigate = useNavigate();
    const { wishlistIds, removeFromWishlist, getWishlistItem } = useWishlist();
    const { addToCart, openCart } = useCart();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [removingId, setRemovingId] = useState(null);

    // Fetch full product data for wishlisted IDs
    useEffect(() => {
        if (wishlistIds.length === 0) {
            setProducts([]);
            setLoading(false);
            return;
        }

        const fetchProducts = async () => {
            setLoading(true);
            try {
                const results = await Promise.all(
                    wishlistIds.map((id) =>
                        fetch(`${API}/products/${id}`)
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
    }, [wishlistIds]);

    const handleRemove = (productId) => {
        setRemovingId(productId);
        setTimeout(() => {
            removeFromWishlist(productId);
            setRemovingId(null);
        }, 250);
    };

    const handleAddToCart = (product) => {
        const wishItem = getWishlistItem(product._id);
        const color = wishItem?.color || '';
        const size = wishItem?.size || product.sizes?.find((s) => s.stock > 0)?.size || '';
        const effectivePrice = getEffectivePrice(product, size);
        const images = getDisplayImages(product, color);
        const image = images[0]?.url || product.images?.[0]?.url || '';

        addToCart({
            productId: product._id,
            name: product.name,
            price: effectivePrice,
            image,
            size,
            color,
            quantity: 1,
        });
        openCart();
    };

    const itemCount = wishlistIds.length;

    return (
        <div className="min-h-screen bg-white flex flex-col">
            <Navbar />

            <div className="flex-1 flex flex-col" style={{ backgroundColor: '#fafafa' }}>
                {/* Page Header */}
                <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ padding: 'clamp(1.25rem, 3vw, 2rem) clamp(1.5rem, 5vw, 4rem)' }}>
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-2 text-sm" style={{ marginBottom: '1rem' }}>
                            <button
                                onClick={() => navigate('/')}
                                className="flex items-center gap-1 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit' }}
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                                Home
                            </button>
                            <span className="text-gray-300">/</span>
                            <span className="text-gray-800 font-medium">Wishlist</span>
                        </div>

                        {/* Title row */}
                        <div className="flex items-baseline gap-3">
                            <h1 className="font-bold text-gray-900" style={{ fontSize: 'clamp(1.4rem, 3vw, 1.85rem)', lineHeight: 1.2 }}>
                                My Wishlist
                            </h1>
                            {itemCount > 0 && (
                                <span className="text-sm font-medium text-gray-400">
                                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Content area */}
                <div className="flex-1 flex flex-col" style={{ padding: 'clamp(1.5rem, 4vw, 2.5rem) clamp(1.5rem, 5vw, 4rem)' }}>

                    {/* Loading */}
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4">
                                <div
                                    className="rounded-full border-4 border-gray-200 animate-spin"
                                    style={{ width: '2.75rem', height: '2.75rem', borderTopColor: '#EFBF04' }}
                                />
                                <p className="text-sm text-gray-400">Loading your wishlist...</p>
                            </div>
                        </div>

                    ) : products.length === 0 ? (
                        /* ═══════════ Empty State ═══════════ */
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center text-center" style={{ maxWidth: '380px' }}>
                                {/* Decorative icon */}
                                <div
                                    className="flex items-center justify-center rounded-full"
                                    style={{
                                        width: '7rem', height: '7rem',
                                        background: 'linear-gradient(145deg, #fef9e7, #fdf2d0)',
                                        marginBottom: '1.75rem',
                                    }}
                                >
                                    <Heart className="w-8 h-8" strokeWidth={1.5} style={{ color: '#d4a904' }} />
                                </div>

                                <h2 className="font-bold text-gray-900" style={{ fontSize: '1.35rem', marginBottom: '0.6rem' }}>
                                    Your wishlist is empty
                                </h2>
                                <p className="text-gray-400 leading-relaxed" style={{ fontSize: '0.9rem', marginBottom: '2rem' }}>
                                    Tap the heart icon on any product to save it here. Your favorites will be waiting for you.
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

                    ) : (
                        /* ═══════════ Filled State — Product Grid ═══════════ */
                        <div
                            className="grid"
                            style={{
                                gridTemplateColumns: 'repeat(auto-fill, minmax(min(15rem, 45%), 1fr))',
                                gap: 'clamp(1rem, 2.5vw, 1.75rem)',
                            }}
                        >
                            {products.map((product) => {
                                const wishItem = getWishlistItem(product._id);
                                const savedColor = wishItem?.color || '';
                                const savedSize = wishItem?.size || '';
                                const images = getDisplayImages(product, savedColor);
                                const imageUrl = images[0]?.url || product.images?.[0]?.url;
                                const effectivePrice = getEffectivePrice(product, savedSize);
                                const showDiscount = shouldShowDiscount(product, savedSize);
                                const isRemoving = removingId === product._id;

                                return (
                                    <div
                                        key={product._id}
                                        className="group bg-white rounded-2xl overflow-hidden transition-all duration-300"
                                        style={{
                                            border: '1px solid #f0f0f0',
                                            opacity: isRemoving ? 0 : 1,
                                            transform: isRemoving ? 'scale(0.95)' : 'scale(1)',
                                            transition: 'opacity 0.25s ease, transform 0.25s ease, box-shadow 0.3s ease',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
                                    >
                                        {/* Image container */}
                                        <div
                                            className="relative overflow-hidden cursor-pointer"
                                            style={{ aspectRatio: '3/4', backgroundColor: '#f8f8f8' }}
                                            onClick={() => navigate(`/product/${product._id}`)}
                                        >
                                            {imageUrl ? (
                                                <img
                                                    src={imageUrl}
                                                    alt={product.name}
                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <span className="text-4xl text-gray-300">📷</span>
                                                </div>
                                            )}

                                            {/* Hover overlay */}
                                            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                            {/* Remove button */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleRemove(product._id); }}
                                                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center cursor-pointer border-none shadow-sm transition-all hover:bg-red-50 hover:scale-110"
                                                title="Remove from wishlist"
                                            >
                                                <X className="w-4 h-4 text-gray-400 hover:text-red-500 transition-colors" strokeWidth={2} />
                                            </button>

                                            {/* Special tag */}
                                            {product.specialTag && (
                                                <span
                                                    className="absolute top-3 left-3 text-xs font-bold uppercase tracking-wider text-white rounded-full"
                                                    style={{ padding: '0.3rem 0.75rem', background: 'linear-gradient(135deg, #EFBF04, #d4a904)' }}
                                                >
                                                    {product.specialTag}
                                                </span>
                                            )}

                                            {/* Discount badge */}
                                            {showDiscount && (
                                                <span
                                                    className="absolute bottom-3 left-3 text-xs font-bold text-white rounded-md"
                                                    style={{ padding: '0.2rem 0.6rem', backgroundColor: '#16a34a' }}
                                                >
                                                    {Math.round((1 - effectivePrice / product.price) * 100)}% OFF
                                                </span>
                                            )}
                                        </div>

                                        {/* Card body */}
                                        <div style={{ padding: '1rem 1rem 1.15rem' }}>
                                            {/* Category */}
                                            <p className="uppercase tracking-wider text-gray-400 truncate" style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
                                                {product.category}
                                            </p>

                                            {/* Name */}
                                            <h3
                                                className="font-semibold text-gray-900 truncate cursor-pointer hover:text-gray-600 transition-colors"
                                                style={{ fontSize: '0.95rem', lineHeight: 1.3 }}
                                                onClick={() => navigate(`/product/${product._id}`)}
                                            >
                                                {product.name}
                                            </h3>

                                            {/* Price */}
                                            <div className="flex items-baseline gap-2" style={{ marginTop: '0.4rem' }}>
                                                <span className="font-bold text-gray-900" style={{ fontSize: '1.05rem' }}>
                                                    {formatPrice(effectivePrice)}
                                                </span>
                                                {showDiscount && (
                                                    <span className="text-gray-400 line-through" style={{ fontSize: '0.8rem' }}>
                                                        {formatPrice(product.price)}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Variant pills */}
                                            {(savedColor || savedSize) && (
                                                <div className="flex flex-wrap gap-1.5" style={{ marginTop: '0.5rem' }}>
                                                    {savedColor && (
                                                        <span
                                                            className="text-xs font-medium rounded-full"
                                                            style={{ padding: '3px 10px', backgroundColor: '#f5f5f5', color: '#555' }}
                                                        >
                                                            {savedColor}
                                                        </span>
                                                    )}
                                                    {savedSize && (
                                                        <span
                                                            className="text-xs font-medium rounded-full"
                                                            style={{ padding: '3px 10px', backgroundColor: '#f5f5f5', color: '#555' }}
                                                        >
                                                            {savedSize}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Add to Bag */}
                                            <button
                                                onClick={() => handleAddToCart(product)}
                                                disabled={product.totalStock === 0}
                                                className="w-full flex items-center justify-center gap-2 font-semibold rounded-lg cursor-pointer border-none transition-all active:scale-[0.98]"
                                                style={{
                                                    marginTop: '0.85rem',
                                                    padding: '0.65rem 1rem',
                                                    fontSize: '0.85rem',
                                                    backgroundColor: product.totalStock === 0 ? '#f3f4f6' : '#1f2937',
                                                    color: product.totalStock === 0 ? '#9ca3af' : '#fff',
                                                    cursor: product.totalStock === 0 ? 'not-allowed' : 'pointer',
                                                }}
                                            >
                                                <ShoppingBag className="w-4 h-4" strokeWidth={2} />
                                                {product.totalStock === 0 ? 'Out of Stock' : 'Add to Bag'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default WishlistPage;
