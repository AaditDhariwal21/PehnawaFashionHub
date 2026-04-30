import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Scale } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';
import { useCompare } from '../context/CompareContext';
import formatPrice from '../utils/formatPrice';
import { getCardPrice } from '../utils/getEffectivePrice';

const API = import.meta.env.VITE_API_URL;
const MAX_RELATED = 6;
const PRICE_RANGE = 0.25; // ±25% of current product price

/**
 * Related Products section shown on the ProductDetailsPage.
 * Fetches same-category products, ranks by price similarity, and
 * displays up to 6 results in a horizontally scrollable row.
 */
const RelatedProducts = ({ currentProduct }) => {
    const navigate = useNavigate();
    const { isWishlisted, toggleWishlist } = useWishlist();
    const { isInCompare, toggleCompare } = useCompare();

    const [related, setRelated] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentProduct?.category) {
            setLoading(false);
            return;
        }

        const fetchRelated = async () => {
            setLoading(true);
            try {
                const res = await fetch(
                    `${API}/products/category/${encodeURIComponent(currentProduct.category)}`
                );
                const data = await res.json();

                if (!data.success || !data.products) {
                    setRelated([]);
                    return;
                }

                // Exclude current product
                const others = data.products.filter((p) => p._id !== currentProduct._id);

                // Rank by price similarity — products within ±25% of current price score higher
                const currentPrice = getCardPrice(currentProduct);
                const lowerBound = currentPrice * (1 - PRICE_RANGE);
                const upperBound = currentPrice * (1 + PRICE_RANGE);

                const scored = others.map((p) => {
                    const pPrice = getCardPrice(p);
                    const inRange = pPrice >= lowerBound && pPrice <= upperBound;
                    // Lower distance = better match; products in range get priority
                    const distance = Math.abs(pPrice - currentPrice);
                    return { product: p, score: inRange ? 0 : distance };
                });

                scored.sort((a, b) => a.score - b.score);

                setRelated(scored.slice(0, MAX_RELATED).map((s) => s.product));
            } catch {
                setRelated([]);
            } finally {
                setLoading(false);
            }
        };

        fetchRelated();
    }, [currentProduct?._id, currentProduct?.category]);

    // Don't render section if nothing to show
    if (!loading && related.length === 0) return null;

    return (
        <div style={{ padding: '2.5rem 0 3rem', borderTop: '1px solid #f0f0f0' }}>
            {/* Section Title */}
            <h2
                className="font-bold text-gray-900 uppercase tracking-wide"
                style={{
                    fontSize: '0.95rem',
                    letterSpacing: '0.1em',
                    marginBottom: '1.5rem',
                    paddingLeft: 'clamp(1rem, 4vw, 2rem)',
                }}
            >
                You May Also Like
            </h2>

            {loading ? (
                /* Skeleton loaders */
                <div
                    className="flex gap-5"
                    style={{
                        paddingLeft: 'clamp(1rem, 4vw, 2rem)',
                        paddingRight: 'clamp(1rem, 4vw, 2rem)',
                        overflowX: 'auto',
                    }}
                >
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex-shrink-0" style={{ width: '13rem' }}>
                            <div className="aspect-[3/4] bg-gray-100 rounded-xl animate-pulse" style={{ marginBottom: '0.5rem' }} />
                            <div className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ marginBottom: '0.35rem', width: '80%' }} />
                            <div className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ width: '50%' }} />
                        </div>
                    ))}
                </div>
            ) : (
                /* Products row */
                <div
                    className="related-products-scroll flex gap-5"
                    style={{
                        paddingLeft: 'clamp(1rem, 4vw, 2rem)',
                        paddingRight: 'clamp(1rem, 4vw, 2rem)',
                        overflowX: 'auto',
                        paddingBottom: '0.5rem',
                    }}
                >
                    {related.map((product) => {
                        const imageUrl = product.images?.[0]?.url;
                        const price = getCardPrice(product);
                        const hasDiscount = price < product.price;

                        return (
                            <div
                                key={product._id}
                                className="group flex-shrink-0 cursor-pointer"
                                style={{ width: 'clamp(11rem, 20vw, 14rem)' }}
                                onClick={() => navigate(`/product/${product._id}`)}
                            >
                                {/* Image */}
                                <div
                                    className="relative overflow-hidden rounded-xl bg-gray-50"
                                    style={{ aspectRatio: '3/4', marginBottom: '0.5rem' }}
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

                                    {/* Wishlist heart (top-right) */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleWishlist(product._id); }}
                                        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center cursor-pointer border-none shadow-sm transition-all hover:scale-110"
                                    >
                                        <Heart
                                            className="w-3.5 h-3.5 transition-colors"
                                            strokeWidth={2}
                                            style={{
                                                fill: isWishlisted(product._id) ? '#ef4444' : 'none',
                                                color: isWishlisted(product._id) ? '#ef4444' : '#6b7280',
                                            }}
                                        />
                                    </button>

                                    {/* Compare toggle (bottom-left) */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleCompare({
                                                productId: product._id,
                                                name: product.name,
                                                image: imageUrl || '',
                                                price,
                                                category: product.category,
                                            });
                                        }}
                                        className="absolute bottom-2.5 left-2.5 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center cursor-pointer border-none shadow-sm transition-all hover:scale-110"
                                        title={isInCompare(product._id) ? 'Remove from compare' : 'Add to compare'}
                                    >
                                        <Scale
                                            className="w-3.5 h-3.5 transition-colors"
                                            strokeWidth={2}
                                            style={{
                                                color: isInCompare(product._id) ? '#EFBF04' : '#6b7280',
                                            }}
                                        />
                                    </button>

                                    {/* Special tag */}
                                    {product.specialTag && (
                                        <span
                                            className="absolute top-2.5 left-2.5 text-xs font-bold uppercase tracking-wider text-white rounded-full"
                                            style={{
                                                padding: '0.25rem 0.6rem',
                                                background: 'linear-gradient(135deg, #EFBF04, #d4a904)',
                                                fontSize: '0.6rem',
                                            }}
                                        >
                                            {product.specialTag}
                                        </span>
                                    )}
                                </div>

                                {/* Info */}
                                <div>
                                    <h3
                                        className="font-semibold text-gray-900 truncate group-hover:text-gray-700 transition-colors"
                                        style={{ fontSize: '0.85rem' }}
                                    >
                                        {product.name}
                                    </h3>
                                    <p
                                        className="font-bold text-gray-900"
                                        style={{ fontSize: '0.9rem', marginTop: '0.2rem' }}
                                    >
                                        {formatPrice(price)}
                                        {hasDiscount && (
                                            <span
                                                style={{
                                                    textDecoration: 'line-through',
                                                    color: '#9ca3af',
                                                    marginLeft: '0.35rem',
                                                    fontSize: '0.8em',
                                                    fontWeight: 400,
                                                }}
                                            >
                                                {formatPrice(product.price)}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default RelatedProducts;
