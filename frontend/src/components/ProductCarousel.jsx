import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Heart, Scale } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';
import { useCompare } from '../context/CompareContext';
import formatPrice from '../utils/formatPrice';
import { startingPrice } from '../utils/variants.js';
import { productUrl } from '../utils/productUrl.js';
import { displayCategory } from '../utils/displayCategory.js';
import CloudinaryImage from './CloudinaryImage.jsx';

/*
 * ProductCarousel — the shared home-page product rail used by both the
 * New Arrivals and Bestsellers sections.
 *
 * Layout (Feature 1): the number of cards per page is derived from the
 * available width against a responsive minimum card width, so the row
 * fills its container with large cards instead of leaving empty gutters.
 * The < 640px branch is intentionally identical to the original New
 * Arrivals layout so the established mobile card count never changes.
 *
 * Animation (Feature 2): paging is a true conveyor belt. On "next" the
 * current page and the incoming page are rendered side by side in a
 * single flex track that translates by one viewport width in one motion
 * (outgoing slides left, incoming slides in from the right — no fade, no
 * blank frame). Only `transform` is animated (GPU-friendly), touch swipe
 * is supported, and `prefers-reduced-motion` collapses it to an instant
 * swap.
 */

const MAX_CARDS = 6;      // cap so ultrawide screens stay tidy
const SLIDE_MS = 450;     // conveyor duration

// Responsive tuning. The < 640 values match the original New Arrivals
// section exactly so mobile behaviour is preserved as a floor; larger
// breakpoints use a bigger minimum card width so desktop cards read large.
const cardMinFor = (w) => (w < 640 ? 180 : w < 1024 ? 200 : 244);
const arrowSpaceFor = (w) => (w < 640 ? 88 : w < 1024 ? 120 : 152);
const gapFor = (w) => (w < 640 ? 16 : w < 1024 ? 20 : 24);

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ProductCarousel = ({ products = [], loading = false, eager = false }) => {
    const navigate = useNavigate();
    const { isWishlisted, toggleWishlist } = useWishlist();
    const { isInCompare, toggleCompare } = useCompare();

    const rowRef = useRef(null);
    const trackRef = useRef(null);
    const timerRef = useRef(null);
    const touchStartRef = useRef(null);

    const [itemsPerPage, setItemsPerPage] = useState(2);
    const [cardGap, setCardGap] = useState(24);
    const [currentIndex, setCurrentIndex] = useState(0);
    // anim === null while idle. During a slide it is { dir, to, run }:
    //   dir  : 'next' | 'prev' — arrow/swipe direction
    //   to   : destination page index
    //   run  : false on the mount frame (no transition), true once the
    //          transform is set so the transition actually animates.
    const [anim, setAnim] = useState(null);

    // Measure the row and derive how many cards fit per page.
    useEffect(() => {
        const measure = () => {
            if (!rowRef.current) return;
            const w = rowRef.current.offsetWidth;
            const gap = gapFor(w);
            const minCard = cardMinFor(w);
            const available = w - arrowSpaceFor(w);
            const count = Math.min(
                MAX_CARDS,
                Math.max(1, Math.floor((available + gap) / (minCard + gap)))
            );
            setCardGap(gap);
            setItemsPerPage(count);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    const totalPages = Math.max(1, Math.ceil(products.length / itemsPerPage));

    // Reset to the first page (and cancel any in-flight slide) whenever the
    // page size changes (resize) or the product set changes. This is the
    // render-phase reset pattern React recommends over a setState-in-effect.
    // Clearing `anim` triggers the fallback-timer effect's cleanup, so the
    // pending timeout is released automatically.
    const resetKey = `${itemsPerPage}|${products.length}`;
    const [prevResetKey, setPrevResetKey] = useState(resetKey);
    if (resetKey !== prevResetKey) {
        setPrevResetKey(resetKey);
        setCurrentIndex(0);
        setAnim(null);
    }

    const norm = useCallback(
        (i) => ((i % totalPages) + totalPages) % totalPages,
        [totalPages]
    );

    const pageItems = useCallback(
        (i) => {
            const p = norm(i);
            return products.slice(p * itemsPerPage, p * itemsPerPage + itemsPerPage);
        },
        [products, itemsPerPage, norm]
    );

    const commit = useCallback(
        (to) => {
            setCurrentIndex(norm(to));
            setAnim(null);
        },
        [norm]
    );

    const start = useCallback(
        (dir, to) => {
            if (anim || totalPages <= 1) return;
            const target = norm(to);
            if (target === currentIndex) return;
            if (prefersReducedMotion()) {
                commit(target);
                return;
            }
            setAnim({ dir, to: target, run: false });
        },
        [anim, totalPages, currentIndex, norm, commit]
    );

    const handleNext = useCallback(() => start('next', currentIndex + 1), [start, currentIndex]);
    const handlePrev = useCallback(() => start('prev', currentIndex - 1), [start, currentIndex]);
    const handleDot = (i) => start(i > currentIndex ? 'next' : 'prev', i);

    // Flip `run` on the frame after the two-page track mounts so the
    // transform change is transitioned rather than applied instantly.
    useEffect(() => {
        if (!anim || anim.run) return;
        const raf = requestAnimationFrame(() =>
            requestAnimationFrame(() => setAnim((a) => (a ? { ...a, run: true } : a)))
        );
        return () => cancelAnimationFrame(raf);
    }, [anim]);

    // Safety net: commit even if transitionend never fires.
    useEffect(() => {
        if (!anim || !anim.run) return;
        timerRef.current = setTimeout(() => commit(anim.to), SLIDE_MS + 80);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [anim, commit]);

    // Touch swipe → advance one page in the swipe direction. We never
    // call preventDefault, so vertical page scrolling is unaffected.
    const onTouchStart = (e) => {
        const t = e.touches[0];
        touchStartRef.current = { x: t.clientX, y: t.clientY };
    };
    const onTouchEnd = (e) => {
        const s = touchStartRef.current;
        touchStartRef.current = null;
        if (!s) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) handleNext();
            else handlePrev();
        }
    };

    // Track transform for the conveyor. Two pages sit in the track; the
    // outgoing page is at translateX(0)/-100% depending on direction.
    let transform = 'translateX(0)';
    let transition = 'none';
    if (anim) {
        if (anim.dir === 'next') transform = anim.run ? 'translateX(-100%)' : 'translateX(0)';
        else transform = anim.run ? 'translateX(0)' : 'translateX(-100%)';
        transition = anim.run ? `transform ${SLIDE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)` : 'none';
    }

    // Pages rendered inside the track. While sliding we render the
    // outgoing + incoming pages in visual order for the direction.
    let pages;
    if (anim) {
        const cur = { key: 'cur', items: pageItems(currentIndex) };
        const tgt = { key: 'tgt', items: pageItems(anim.to) };
        pages = anim.dir === 'next' ? [cur, tgt] : [tgt, cur];
    } else {
        pages = [{ key: 'cur', items: pageItems(currentIndex) }];
    }

    const arrowsDisabled = !!anim || products.length === 0 || totalPages <= 1;

    // `cardEager` is set only for the first, above-the-fold page of an eager
    // carousel (New Arrivals). Everything else lazy-loads.
    const renderCard = (product, cardEager = false) => (
        <div
            key={product._id}
            className="group cursor-pointer min-w-0"
            onClick={() => navigate(productUrl(product))}
        >
            {/* Product Image */}
            <div className="aspect-[3/4] bg-stone-100 rounded-lg overflow-hidden relative mb-2 sm:mb-3">
                {product.images && product.images.length > 0 ? (
                    <CloudinaryImage
                        src={product.images[0].url}
                        alt={product?.name || 'Product Image'}
                        preset="card"
                        eager={cardEager}
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
                    aria-label="Toggle wishlist"
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
                        style={{ color: isInCompare(product._id) ? '#EFBF04' : '#6b7280' }}
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
    );

    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: `repeat(${itemsPerPage}, 1fr)`,
        gap: `${cardGap}px`,
    };

    return (
        <div className="w-full flex flex-col items-center gap-[clamp(1rem,2.5vw,3rem)]">
            <div className="w-full max-w-[1850px] mx-auto px-8 sm:px-10 md:px-12 lg:px-14 xl:px-16">
                <div ref={rowRef} className="flex items-center w-full gap-3 sm:gap-5 lg:gap-7">
                    {/* Left Arrow */}
                    <button
                        onClick={handlePrev}
                        disabled={arrowsDisabled}
                        aria-label="Previous"
                        className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-stone-200 rounded-full shadow-md flex items-center justify-center text-gray-700 hover:bg-stone-300 hover:text-gray-900 hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer z-10"
                    >
                        <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
                    </button>

                    {/* Viewport */}
                    <div
                        className="flex-1 min-w-0 overflow-hidden"
                        style={{ touchAction: 'pan-y' }}
                        onTouchStart={onTouchStart}
                        onTouchEnd={onTouchEnd}
                    >
                        {loading ? (
                            <div style={gridStyle}>
                                {Array.from({ length: itemsPerPage }).map((_, index) => (
                                    <div key={index}>
                                        <div className="aspect-[3/4] bg-stone-200 rounded-lg animate-pulse mb-3"></div>
                                        <div className="h-4 bg-stone-200 rounded animate-pulse mb-2"></div>
                                        <div className="h-4 bg-stone-200 rounded animate-pulse w-1/3"></div>
                                    </div>
                                ))}
                            </div>
                        ) : products.length > 0 ? (
                            <div
                                ref={trackRef}
                                className="flex w-full"
                                style={{ transform, transition, willChange: anim ? 'transform' : 'auto' }}
                                onTransitionEnd={(e) => {
                                    if (e.target === trackRef.current && e.propertyName === 'transform' && anim) {
                                        commit(anim.to);
                                    }
                                }}
                            >
                                {pages.map((page) => {
                                    // Eager-load only the initially visible first
                                    // page of an eager carousel — the real
                                    // above-the-fold homepage imagery.
                                    const pageEager =
                                        eager && page.key === 'cur' && currentIndex === 0 && !anim;
                                    return (
                                        <div key={page.key} className="shrink-0 grow-0 basis-full min-w-0" style={gridStyle}>
                                            {page.items.map((p) => renderCard(p, pageEager))}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center text-gray-500 py-10">No products available</div>
                        )}
                    </div>

                    {/* Right Arrow */}
                    <button
                        onClick={handleNext}
                        disabled={arrowsDisabled}
                        aria-label="Next"
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
                            onClick={() => handleDot(index)}
                            disabled={!!anim}
                            aria-label={`Go to page ${index + 1}`}
                            className={`h-2 rounded-full transition-all duration-300 ${
                                currentIndex === index ? 'bg-gray-900 w-6' : 'bg-gray-300 hover:bg-gray-400 w-2'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default ProductCarousel;
