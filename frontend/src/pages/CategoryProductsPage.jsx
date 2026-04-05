import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Heart } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useWishlist } from '../context/WishlistContext';
import formatPrice from '../utils/formatPrice';

const CategoryProductsPage = () => {
    const { categoryName } = useParams();
    const navigate = useNavigate();
    const { isWishlisted, toggleWishlist } = useWishlist();

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const displayName = decodeURIComponent(categoryName);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                setLoading(true);
                setError(null);
                const response = await fetch(
                    `${import.meta.env.VITE_API_URL}/products/category/${encodeURIComponent(categoryName)}`
                );
                const data = await response.json();

                if (!data.success) {
                    throw new Error(data.message || 'Failed to fetch products');
                }

                setProducts(data.products);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, [categoryName]);

    /* ───────────────── Loading ───────────────── */
    if (loading) {
        return (
            <div className="min-h-screen bg-white">
                <Navbar />
                <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 4rem)' }}>
                    <div className="flex flex-col items-center gap-4">
                        <div
                            className="rounded-full border-4 border-gray-200 animate-spin"
                            style={{ width: '3rem', height: '3rem', borderTopColor: '#EFBF04' }}
                        />
                        <p className="text-gray-500 text-sm">Loading {displayName}...</p>
                    </div>
                </div>
            </div>
        );
    }

    /* ───────────────── Error ───────────────── */
    if (error) {
        return (
            <div className="min-h-screen bg-white">
                <Navbar />
                <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 4rem)' }}>
                    <div className="flex flex-col items-center gap-4 text-center px-4">
                        <div
                            className="flex items-center justify-center rounded-full bg-red-50"
                            style={{ width: '4rem', height: '4rem' }}
                        >
                            <span className="text-red-400 text-2xl">!</span>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">Something went wrong</h2>
                        <p className="text-gray-500 text-sm max-w-md">{error}</p>
                        <button
                            onClick={() => navigate('/')}
                            className="mt-2 px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    /* ───────────────── Page ───────────────── */
    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Breadcrumb */}
            <div className="border-b border-gray-100" style={{ padding: '0.75rem 2rem' }}>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-1 hover:text-gray-800 transition-colors cursor-pointer"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Home
                    </button>
                    <span>/</span>
                    <span className="text-gray-800 font-medium">{displayName}</span>
                </div>
            </div>

            {/* Header */}
            <div style={{ padding: '2.5rem 2rem 1rem' }}>
                <h1 className="font-bold text-gray-900" style={{ fontSize: '2rem' }}>
                    {displayName}
                </h1>
                <p className="text-gray-500 text-sm" style={{ marginTop: '0.4rem' }}>
                    {products.length} {products.length === 1 ? 'product' : 'products'} found
                </p>
            </div>

            {/* Product Grid */}
            <div style={{ padding: '1.5rem 2rem 4rem' }}>
                {products.length === 0 ? (
                    /* Empty state */
                    <div
                        className="flex flex-col items-center justify-center text-center"
                        style={{ padding: '5rem 1rem' }}
                    >
                        <div
                            className="flex items-center justify-center rounded-full bg-gray-50"
                            style={{ width: '5rem', height: '5rem', marginBottom: '1.25rem' }}
                        >
                            <span className="text-3xl">🛍️</span>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-700">No products yet</h3>
                        <p className="text-gray-400 text-sm" style={{ marginTop: '0.4rem' }}>
                            Check back soon — we're adding new pieces regularly!
                        </p>
                    </div>
                ) : (
                    <div
                        className="grid"
                        style={{
                            gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))',
                            gap: '2rem',
                        }}
                    >
                        {products.map((product) => {
                            const imageUrl = product.images?.[0]?.url;
                            return (
                                <div
                                    key={product._id}
                                    onClick={() => navigate(`/product/${product._id}`)}
                                    className="group cursor-pointer"
                                >
                                    {/* Image */}
                                    <div
                                        className="relative overflow-hidden rounded-xl bg-gray-50"
                                        style={{ aspectRatio: '3/4' }}
                                    >
                                        {imageUrl ? (
                                            <img
                                                src={imageUrl}
                                                alt={product.name}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-gray-100 to-gray-200">
                                                <span className="text-4xl text-gray-300">📷</span>
                                            </div>
                                        )}

                                        {/* Hover overlay */}
                                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />

                                        {/* Wishlist heart */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleWishlist(product._id); }}
                                            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center cursor-pointer border-none shadow-sm transition-all hover:scale-110"
                                        >
                                            <Heart
                                                className="w-4 h-4 transition-colors"
                                                strokeWidth={2}
                                                style={{
                                                    fill: isWishlisted(product._id) ? '#ef4444' : 'none',
                                                    color: isWishlisted(product._id) ? '#ef4444' : '#6b7280',
                                                }}
                                            />
                                        </button>

                                        {/* Special Tag */}
                                        {product.specialTag && (
                                            <span
                                                className="absolute top-3 left-3 text-xs font-bold uppercase tracking-wider text-white rounded-full"
                                                style={{
                                                    padding: '0.3rem 0.75rem',
                                                    background: 'linear-gradient(135deg, #EFBF04, #d4a904)',
                                                }}
                                            >
                                                {product.specialTag}
                                            </span>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div style={{ padding: '0.75rem 0.25rem 0' }}>
                                        <h3
                                            className="font-semibold text-gray-900 truncate group-hover:text-gray-700 transition-colors"
                                            style={{ fontSize: '0.95rem' }}
                                        >
                                            {product.name}
                                        </h3>
                                        <p
                                            className="font-bold text-gray-900"
                                            style={{ fontSize: '1rem', marginTop: '0.3rem' }}
                                        >
                                            {product.sellingPrice != null ? (
                                                <>
                                                    {formatPrice(product.sellingPrice)}
                                                    <span style={{ textDecoration: 'line-through', color: '#9ca3af', marginLeft: '0.4rem', fontSize: '0.85em' }}>
                                                        {formatPrice(product.price)}
                                                    </span>
                                                </>
                                            ) : formatPrice(product.price)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CategoryProductsPage;
