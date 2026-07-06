import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Heart, Scale } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';
import { useCompare } from '../context/CompareContext';
import formatPrice from '../utils/formatPrice';
import { startingPrice } from '../utils/variants.js';
import { productUrl } from '../utils/productUrl.js';
import { displayCategory } from '../utils/displayCategory.js';

const CARD_MIN_WIDTH = 180;  // px — minimum comfortable card width
const MAX_CARDS = 5;         // never show more than 5 at once

const NewArrivalsSection = () => {
    const navigate = useNavigate();
    const { isWishlisted, toggleWishlist } = useWishlist();
    const { isInCompare, toggleCompare } = useCompare();
    const containerRef = useRef(null);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationClass, setAnimationClass] = useState('');
    const [itemsPerPage, setItemsPerPage] = useState(2);
    const [cardGap, setCardGap] = useState(24);

    // Measure container and compute how many cards fit
    useEffect(() => {
        const measure = () => {
            if (!containerRef.current) return;
            const w = containerRef.current.offsetWidth;
            // Reserved space for arrows + breathing room on both sides
            const arrowSpace = w < 640 ? 88 : w < 1024 ? 120 : 152;
            const gap = w < 640 ? 16 : w < 1024 ? 20 : 24;
            const available = w - arrowSpace;
            const count = Math.min(MAX_CARDS, Math.max(1, Math.floor((available + gap) / (CARD_MIN_WIDTH + gap))));
            setCardGap(gap);
            setItemsPerPage(count);
        };

        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    // Fetch products from backend
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_URL}/products/tag/New Arrival`);
                const data = await response.json();
                if (data.success) {
                    setProducts(data.products);
                }
            } catch (error) {
                console.error('Error fetching products:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    const totalPages = Math.max(1, Math.ceil(products.length / itemsPerPage));

    // Reset page index when itemsPerPage changes
    useEffect(() => {
        setCurrentIndex(0);
    }, [itemsPerPage]);

    const handlePrev = useCallback(() => {
        if (isAnimating) return;
        setIsAnimating(true);
        setAnimationClass('slide-out-right');
        setTimeout(() => {
            setCurrentIndex((prev) => (prev === 0 ? totalPages - 1 : prev - 1));
            setAnimationClass('slide-in-left');
        }, 250);
        setTimeout(() => {
            setAnimationClass('');
            setIsAnimating(false);
        }, 500);
    }, [isAnimating, totalPages]);

    const handleNext = useCallback(() => {
        if (isAnimating) return;
        setIsAnimating(true);
        setAnimationClass('slide-out-left');
        setTimeout(() => {
            setCurrentIndex((prev) => (prev === totalPages - 1 ? 0 : prev + 1));
            setAnimationClass('slide-in-right');
        }, 250);
        setTimeout(() => {
            setAnimationClass('');
            setIsAnimating(false);
        }, 500);
    }, [isAnimating, totalPages]);

    const handleDotClick = (index) => {
        if (isAnimating || index === currentIndex) return;
        const direction = index > currentIndex ? 'next' : 'prev';
        setIsAnimating(true);
        setAnimationClass(direction === 'next' ? 'slide-out-left' : 'slide-out-right');
        setTimeout(() => {
            setCurrentIndex(index);
            setAnimationClass(direction === 'next' ? 'slide-in-right' : 'slide-in-left');
        }, 250);
        setTimeout(() => {
            setAnimationClass('');
            setIsAnimating(false);
        }, 500);
    };

    const visibleProducts = products.slice(
        currentIndex * itemsPerPage,
        currentIndex * itemsPerPage + itemsPerPage
    );

    // Animation styles
    const getAnimationStyle = () => {
        switch (animationClass) {
            case 'slide-out-left':
                return { transform: 'translateX(-100%)', opacity: 0, transition: 'all 0.25s ease-in' };
            case 'slide-out-right':
                return { transform: 'translateX(100%)', opacity: 0, transition: 'all 0.25s ease-in' };
            case 'slide-in-right':
            case 'slide-in-left':
                return { transform: 'translateX(0)', opacity: 1, transition: 'all 0.25s ease-out' };
            default:
                return { transform: 'translateX(0)', opacity: 1 };
        }
    };

    // Initial position for slide-in animations
    useEffect(() => {
        const el = document.getElementById('products-grid');
        if (!el) return;
        if (animationClass === 'slide-in-right') {
            el.style.transform = 'translateX(100%)';
            el.style.opacity = '0';
            requestAnimationFrame(() => {
                el.style.transition = 'all 0.25s ease-out';
                el.style.transform = 'translateX(0)';
                el.style.opacity = '1';
            });
        } else if (animationClass === 'slide-in-left') {
            el.style.transform = 'translateX(-100%)';
            el.style.opacity = '0';
            requestAnimationFrame(() => {
                el.style.transition = 'all 0.25s ease-out';
                el.style.transform = 'translateX(0)';
                el.style.opacity = '1';
            });
        }
    }, [animationClass]);

    return (
        <div
            className="w-full flex flex-col items-center"
            style={{
                paddingTop: 'clamp(1.25rem, 3.5vw, 3rem)',
                paddingBottom: 'clamp(2rem, 5vw, 6rem)',
                gap: 'clamp(1rem, 2.5vw, 3rem)',
                background: 'linear-gradient(to bottom, #FFFFFF 0%, #FFFFFF 85%, #FAD76C 100%)',
            }}
        >
            {/* Section Title */}
            <h2
                className="font-light text-gray-900 tracking-wide uppercase text-center px-4"
                style={{ fontSize: 'clamp(1.25rem, 3.5vw, 3rem)' }}
            >
                New Arrivals
            </h2>

            {/* Products Carousel */}
            <div className="w-full max-w-[1700px] mx-auto px-8 sm:px-12 md:px-16 lg:px-24 xl:px-32 2xl:px-44">
                <div ref={containerRef} className="flex items-center w-full overflow-hidden gap-3 sm:gap-5 lg:gap-7">
                    {/* Left Arrow */}
                    <button
                        onClick={handlePrev}
                        disabled={isAnimating || products.length === 0}
                        className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-stone-200 rounded-full shadow-md flex items-center justify-center text-gray-700 hover:bg-stone-300 hover:text-gray-900 hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer z-10"
                    >
                        <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
                    </button>

                    {/* Products Grid */}
                    <div
                        id="products-grid"
                        className="flex-1 grid min-w-0"
                        style={{
                            gridTemplateColumns: `repeat(${itemsPerPage}, 1fr)`,
                            gap: `${cardGap}px`,
                            ...(animationClass.startsWith('slide-out') ? getAnimationStyle() : {}),
                        }}
                    >
                    {loading ? (
                        Array.from({ length: itemsPerPage }).map((_, index) => (
                            <div key={index}>
                                <div className="aspect-[3/4] bg-stone-200 rounded-lg animate-pulse mb-3"></div>
                                <div className="h-4 bg-stone-200 rounded animate-pulse mb-2"></div>
                                <div className="h-4 bg-stone-200 rounded animate-pulse w-1/3"></div>
                            </div>
                        ))
                    ) : visibleProducts.length > 0 ? (
                        visibleProducts.map((product) => (
                            <div
                                key={product._id}
                                className="group cursor-pointer min-w-0"
                                onClick={() => navigate(productUrl(product))}
                            >
                                {/* Product Image */}
                                <div className="aspect-[3/4] bg-stone-100 rounded-lg overflow-hidden relative mb-2 sm:mb-3">
                                    {product.images && product.images.length > 0 ? (
                                        <img
                                            src={product.images[0].url}
                                            alt={product?.name || "Product Image"}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-b from-stone-200 to-stone-300 flex items-center justify-center">
                                            <div className="w-20 h-20 rounded-full bg-stone-400/30"></div>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleWishlist(product._id); }}
                                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center cursor-pointer border-none shadow-sm transition-all hover:scale-110"
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

                                    {/* Compare toggle */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleCompare({
                                                productId: product._id,
                                                name: product.name,
                                                image: product.images?.[0]?.url || '',
                                                price: startingPrice(product),
                                                category: product.category,
                                            });
                                        }}
                                        className="absolute bottom-2 left-2 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center cursor-pointer border-none shadow-sm transition-all hover:scale-110"
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
                                </div>

                                {/* Product Info */}
                                <div className="min-w-0">
                                    <h3
                                        className="text-gray-800 font-normal leading-snug mb-1 line-clamp-2"
                                        style={{ fontSize: 'clamp(0.75rem, 1.5vw, 1rem)' }}
                                    >
                                        {product.name} - {displayCategory(product.category)}
                                    </h3>
                                    <p
                                        className="text-gray-600 font-medium"
                                        style={{ fontSize: 'clamp(0.75rem, 1.5vw, 1rem)' }}
                                    >
                                        {(() => {
                                            const from = startingPrice(product);
                                            const discounted = from < product.price;
                                            return discounted ? (
                                                <>
                                                    {formatPrice(from)}
                                                    <span style={{ textDecoration: 'line-through', color: '#9ca3af', marginLeft: '0.35rem', fontSize: '0.85em' }}>
                                                        {formatPrice(product.price)}
                                                    </span>
                                                </>
                                            ) : formatPrice(from);
                                        })()}
                                    </p>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div
                            className="text-center text-gray-500 py-10"
                            style={{ gridColumn: `1 / -1` }}
                        >
                            No products available
                        </div>
                    )}
                </div>

                    {/* Right Arrow */}
                    <button
                        onClick={handleNext}
                        disabled={isAnimating || products.length === 0}
                        className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-stone-200 rounded-full shadow-md flex items-center justify-center text-gray-700 hover:bg-stone-300 hover:text-gray-900 hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer z-10"
                    >
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
                    </button>
                </div>
            </div>

            {/* Page Indicators */}
            {totalPages > 1 && (
                <div className="flex items-center gap-2">
                    {Array.from({ length: totalPages }).map((_, index) => (
                        <button
                            key={index}
                            onClick={() => handleDotClick(index)}
                            disabled={isAnimating}
                            className={`h-2 rounded-full transition-all duration-300 ${
                                currentIndex === index
                                    ? 'bg-gray-900 w-6'
                                    : 'bg-gray-300 hover:bg-gray-400 w-2'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default NewArrivalsSection;
