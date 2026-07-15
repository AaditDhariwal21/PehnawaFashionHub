import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Heart, Ruler, ChevronDown } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useCompare } from '../context/CompareContext';
import formatPrice from '../utils/formatPrice';
import {
    colorsWithVariants,
    allSizes,
    findVariant,
    sizeStatus,
    displayPrice,
    hasDiscount,
    defaultColor,
} from '../utils/variants.js';
import { getDisplayImages } from '../utils/getDisplayImages';
import { getProductAltText } from '../utils/productAltText.js';
import { displayCategory } from '../utils/displayCategory.js';
import CloudinaryImage from '../components/CloudinaryImage.jsx';
import { getSizeChart } from '../utils/sizeCharts.js';
import RelatedProducts from '../components/RelatedProducts';
import SizeChartModal from '../components/SizeChartModal';

const ProductDetailsPage = () => {
    // The page is mounted on two routes — slug-based (canonical) and
    // id-based (legacy). Pick the right fetch URL from whichever params
    // are present.
    const { id, categorySlug, productSlug } = useParams();
    const navigate = useNavigate();
    const { addToCart, openCart, setBuyNowItem } = useCart();
    const { isWishlisted, toggleWishlist } = useWishlist();
    const { compareCount } = useCompare();

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedImage, setSelectedImage] = useState(0);
    const [selectedSize, setSelectedSize] = useState(null);
    const [selectedColor, setSelectedColor] = useState(null);
    const [sizeChartOpen, setSizeChartOpen] = useState(false);
    const [descOpen, setDescOpen] = useState(false);          // Product Details accordion (mobile)
    const [stickyVisible, setStickyVisible] = useState(false); // mobile sticky Add-to-Cart bar
    const inlineCtaRef = useRef(null);

    useEffect(() => {
        const fetchProduct = async () => {
            try {
                setLoading(true);
                const url = productSlug
                    ? `${import.meta.env.VITE_API_URL}/products/by-slug/${categorySlug}/${productSlug}`
                    : `${import.meta.env.VITE_API_URL}/products/${id}`;
                const response = await fetch(url);
                const data = await response.json();
                if (!data.success) throw new Error(data.message || 'Product not found');

                // The backend returns `redirectTo` whenever the URL the
                // browser is on is not the canonical slug URL — either
                // because it's a legacy /product/:id link, or because
                // the categorySlug in the path is stale. Swap with
                // `replace` so we don't pollute browser history.
                if (data.redirectTo) {
                    navigate(data.redirectTo, { replace: true });
                    return;
                }

                setProduct(data.product);
                setSelectedColor(defaultColor(data.product));
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchProduct();
    }, [id, categorySlug, productSlug, navigate]);

    // Reset image index when color changes
    useEffect(() => {
        setSelectedImage(0);
    }, [selectedColor]);

    // If switching color makes the current size unavailable, clear it
    useEffect(() => {
        if (!product || !selectedColor || !selectedSize) return;
        if (sizeStatus(product, selectedColor, selectedSize) !== 'available') {
            setSelectedSize(null);
        }
    }, [product, selectedColor, selectedSize]);

    // Sticky mobile Add-to-Cart bar: show it only while the inline action
    // buttons are scrolled out of view (avoids a duplicate CTA on screen).
    useEffect(() => {
        const el = inlineCtaRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => setStickyVisible(!entry.isIntersecting),
            { rootMargin: '0px 0px -96px 0px' }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [product]);

    /* ───────────────── Loading State ───────────────── */
    if (loading) {
        return (
            <div className="min-h-screen bg-white">
                <Navbar />
                <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 5rem)' }}>
                    <div className="flex flex-col items-center gap-4">
                        <div className="rounded-full border-4 border-gray-200 animate-spin" style={{ width: '3rem', height: '3rem', borderTopColor: '#EFBF04' }} />
                        <p className="text-gray-500 text-sm">Loading product...</p>
                    </div>
                </div>
            </div>
        );
    }

    /* ───────────────── Error State ───────────────── */
    if (error || !product) {
        return (
            <div className="min-h-screen bg-white">
                <Navbar />
                <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 5rem)' }}>
                    <div className="flex flex-col items-center gap-4 text-center px-4">
                        <div className="flex items-center justify-center rounded-full bg-red-50" style={{ width: '4rem', height: '4rem' }}>
                            <span className="text-red-400 text-2xl">!</span>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">Product Not Found</h2>
                        <p className="text-gray-500 text-sm max-w-md">{error || "We couldn't find the product you're looking for."}</p>
                        <button onClick={() => navigate('/')} className="mt-2 px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer">
                            Back to Home
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Resolve images based on selected color
    const images = getDisplayImages(product, selectedColor);
    const mainImageUrl = images[selectedImage]?.url || '';

    // Variant + pricing
    const selectedVariant = findVariant(product, selectedColor, selectedSize);
    const effectivePrice = displayPrice(product, selectedColor, selectedSize);
    const showDiscount = hasDiscount(product, selectedColor, selectedSize);

    const colors = colorsWithVariants(product);
    const sizes = allSizes(product);
    const sizeChart = getSizeChart(product.category);

    // The rich-text editor stores non-breaking spaces (&nbsp;/U+00A0) between
    // words, which the browser never line-breaks — long phrases then overflow
    // their column on narrow screens. Normalise them to regular spaces so the
    // description wraps naturally on mobile.
    const descHtml = (product.description || '').replace(/&nbsp;/gi, ' ').replace(/\u00a0/g, ' ');

    const isPurchasable = selectedVariant && selectedVariant.stock > 0;

    const handleBuyNow = () => {
        if (!selectedColor) { alert('Please select a color.'); return; }
        if (!selectedSize) { alert('Please select a size.'); return; }
        if (!selectedVariant) { alert('That combination is not available.'); return; }
        if (selectedVariant.stock === 0) { alert('That combination is out of stock.'); return; }
        setBuyNowItem({
            productId: product._id,
            name: product.name,
            price: selectedVariant.price,
            image: images[0]?.url || '',
            size: selectedSize,
            color: selectedColor,
            quantity: 1,
        });
        navigate('/checkout');
    };

    const handleAddToCart = () => {
        if (!selectedColor) { alert('Please select a color.'); return; }
        if (!selectedSize) { alert('Please select a size.'); return; }
        if (!selectedVariant || selectedVariant.stock === 0) {
            alert('That combination is unavailable.');
            return;
        }
        addToCart({
            productId: product._id,
            name: product.name,
            price: selectedVariant.price,
            image: images[0]?.url || '',
            size: selectedSize,
            color: selectedColor,
            quantity: 1,
        });
        openCart();
    };

    /* ───────────────── Product Page ───────────────── */
    return (
        <div className="min-h-screen bg-white pb-18 md:pb-0">
            <Navbar />

            {/* Breadcrumb */}
            <div className="border-b border-gray-100" style={{ padding: '0.75rem clamp(1rem, 4vw, 2rem)' }}>
                <div className="max-w-7xl mx-auto flex items-center gap-2 text-sm text-gray-500">
                    <button onClick={() => navigate('/')} className="flex items-center gap-1 hover:text-gray-800 transition-colors cursor-pointer">
                        <ChevronLeft className="w-4 h-4" /> Home
                    </button>
                    <span>/</span>
                    <button onClick={() => navigate(`/products/${encodeURIComponent(displayCategory(product.category))}`)} className="hover:text-gray-800 transition-colors cursor-pointer" style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit' }}>
                        {displayCategory(product.category)}
                    </button>
                    {product.subCategory && (
                        <>
                            <span>/</span>
                            <button onClick={() => navigate(`/products/${encodeURIComponent(displayCategory(product.category))}/${encodeURIComponent(product.subCategory)}`)} className="hover:text-gray-800 transition-colors cursor-pointer" style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit' }}>
                                {product.subCategory}
                            </button>
                        </>
                    )}
                    <span>/</span>
                    <span className="text-gray-800 font-medium truncate max-w-xs">{product.name}</span>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto" style={{ padding: 'clamp(1rem, 4vw, 2rem)' }}>
                <div className="flex flex-col md:flex-row gap-6 md:gap-10">

                    {/* ═══════════ LEFT — Image Gallery ═══════════ */}
                    <div className="w-full md:flex-1 md:max-w-[450px]">
                        {/* Main Image */}
                        <div className="relative overflow-hidden rounded-2xl bg-gray-50 group" style={{ aspectRatio: '3/4' }}>
                            {mainImageUrl ? (
                                <CloudinaryImage src={mainImageUrl} alt={getProductAltText(product, images[selectedImage])} preset="detailMain" eager className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300"><span className="text-6xl">📷</span></div>
                            )}
                            {product.specialTag && (
                                <span className="absolute top-4 left-4 text-xs font-bold uppercase tracking-wider text-white rounded-full" style={{ padding: '0.35rem 0.9rem', background: 'linear-gradient(135deg, #EFBF04, #d4a904)' }}>
                                    {product.specialTag}
                                </span>
                            )}
                        </div>

                        {/* Thumbnails */}
                        {images.length > 1 && (
                            <div className="flex gap-3 mt-4 overflow-x-auto" style={{ paddingBottom: '0.25rem' }}>
                                {images.map((img, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setSelectedImage(index)}
                                        className="flex-shrink-0 rounded-xl overflow-hidden transition-all duration-200 cursor-pointer"
                                        style={{
                                            width: '5rem', height: '6.5rem',
                                            border: selectedImage === index ? '2.5px solid #EFBF04' : '2px solid transparent',
                                            opacity: selectedImage === index ? 1 : 0.6,
                                            transform: selectedImage === index ? 'scale(1.05)' : 'scale(1)',
                                        }}
                                    >
                                        <CloudinaryImage src={img.url} alt={`${getProductAltText(product, img)} ${index + 1}`} preset="thumb" className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ═══════════ RIGHT — Product Details ═══════════ */}
                    {/* min-w-0 lets this flex column shrink to its share instead of
                        being blown out by long unbreakable strings in the description. */}
                    <div className="w-full md:flex-1 min-w-0">
                        {/* Category */}
                        <p className="uppercase tracking-widest font-semibold" style={{ fontSize: '0.7rem', color: '#EFBF04', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                            {displayCategory(product.category)}
                        </p>

                        {/* Product Name */}
                        <h1 className="font-bold text-gray-900 leading-tight text-[1.35rem] md:text-[1.85rem]" style={{ marginBottom: '0.5rem' }}>
                            {product.name}
                        </h1>

                        {/* Short Description */}
                        {product.shortDescription && (
                            <p className="text-gray-500 leading-relaxed" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                                {product.shortDescription}
                            </p>
                        )}

                        <hr className="border-gray-100" style={{ marginBottom: '1.25rem' }} />

                        {/* Price */}
                        <div className="flex items-baseline gap-3" style={{ marginBottom: '0.4rem' }}>
                            {!selectedVariant && (
                                <span className="text-gray-500 text-xs uppercase tracking-wider" style={{ marginRight: '0.25rem' }}>
                                    From
                                </span>
                            )}
                            <span className="font-bold text-gray-900" style={{ fontSize: '1.75rem' }}>
                                {formatPrice(effectivePrice)}
                            </span>
                            {showDiscount && (
                                <>
                                    <span className="text-gray-400 line-through" style={{ fontSize: '1.1rem' }}>
                                        {formatPrice(product.price)}
                                    </span>
                                    <span className="text-sm font-semibold" style={{ color: '#16a34a' }}>
                                        {Math.round((1 - effectivePrice / product.price) * 100)}% off
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Stock indicator (variant-aware) */}
                        {selectedVariant ? (
                            <p className="text-sm" style={{ marginBottom: '1.5rem', color: selectedVariant.stock === 0 ? '#ef4444' : '#6b7280' }}>
                                {selectedVariant.stock === 0 ? 'Out of Stock' : (
                                    <>In Stock — <span style={{ color: selectedVariant.stock > 3 ? '#16a34a' : '#ef4444', fontWeight: 600 }}>{selectedVariant.stock} left</span></>
                                )}
                            </p>
                        ) : (
                            <p className="text-sm text-gray-400" style={{ marginBottom: '1.5rem' }}>
                                Select a size to see availability.
                            </p>
                        )}

                        {/* Weight */}
                        {product.weight > 0 && (
                            <p className="text-sm" style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
                                Weight: <span style={{ fontWeight: 600, color: '#374151' }}>{product.weight} lbs</span>
                            </p>
                        )}

                        <hr className="border-gray-100" style={{ marginBottom: '1.5rem' }} />

                        {/* Color Selector */}
                        {colors.length > 0 && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <p className="font-bold text-gray-900 uppercase tracking-wide" style={{ fontSize: '0.85rem', marginBottom: '0.85rem' }}>
                                    Select Color {selectedColor && <span className="font-normal normal-case text-gray-500">— {selectedColor}</span>}
                                </p>
                                <div className="flex gap-3 flex-wrap">
                                    {colors.map((colorName) => {
                                        const colorEntry = product.colors.find((c) => c.colorName === colorName);
                                        const isSelected = selectedColor === colorName;
                                        const previewImg = colorEntry?.images?.[0]?.url;
                                        return (
                                            <button
                                                key={colorName}
                                                onClick={() => setSelectedColor(colorName)}
                                                className="flex flex-col items-center gap-1 cursor-pointer bg-transparent border-none transition-all duration-200"
                                                style={{ opacity: isSelected ? 1 : 0.7, transform: isSelected ? 'scale(1.05)' : 'scale(1)' }}
                                                title={colorName}
                                            >
                                                <div
                                                    className="rounded-lg overflow-hidden"
                                                    style={{
                                                        width: '3.5rem', height: '4.5rem',
                                                        border: isSelected ? '2.5px solid #EFBF04' : '2px solid #e5e7eb',
                                                    }}
                                                >
                                                    {previewImg ? (
                                                        <CloudinaryImage src={previewImg} alt={colorName} preset="thumb" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                                                            {colorName.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-xs text-gray-600 font-medium" style={{ maxWidth: '4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {colorName}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Size Selector — derived from selectedColor */}
                        {sizes.length > 0 && (
                            <div style={{ marginBottom: '2rem' }}>
                                <div className="flex items-center justify-between" style={{ marginBottom: '0.85rem' }}>
                                    <p className="font-bold text-gray-900 uppercase tracking-wide" style={{ fontSize: '0.85rem' }}>
                                        Select Size
                                    </p>
                                    {sizeChart && (
                                        <button
                                            type="button"
                                            onClick={() => setSizeChartOpen(true)}
                                            className="flex items-center gap-1.5 cursor-pointer transition-colors min-h-11 md:min-h-0"
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                padding: 0,
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                color: '#EFBF04',
                                                textDecoration: 'underline',
                                                textUnderlineOffset: '3px',
                                                fontFamily: 'inherit',
                                            }}
                                        >
                                            <Ruler className="w-3.5 h-3.5" strokeWidth={2.2} />
                                            View Size Chart
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-3 flex-wrap">
                                    {sizes.map((size) => {
                                        const status = selectedColor ? sizeStatus(product, selectedColor, size) : 'unavailable';
                                        const disabled = status !== 'available';
                                        const isSelected = selectedSize === size;
                                        const tooltip =
                                            status === 'unavailable' ? 'Not available in this color' :
                                            status === 'sold-out' ? 'Out of stock' : '';
                                        return (
                                            <button
                                                key={size}
                                                onClick={() => !disabled && setSelectedSize(size)}
                                                disabled={disabled}
                                                title={tooltip}
                                                className="font-semibold transition-all duration-200"
                                                style={{
                                                    width: '3rem', height: '3rem', borderRadius: '50%', fontSize: '0.85rem',
                                                    border: isSelected ? '2px solid #EFBF04' : '1.5px solid #d1d5db',
                                                    backgroundColor: disabled ? '#f3f4f6' : isSelected ? '#EFBF04' : 'transparent',
                                                    color: disabled ? '#9ca3af' : isSelected ? '#ffffff' : '#374151',
                                                    transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                                    opacity: status === 'unavailable' ? 0.35 : status === 'sold-out' ? 0.55 : 1,
                                                    textDecoration: status === 'sold-out' ? 'line-through' : 'none',
                                                }}
                                            >
                                                {size}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div ref={inlineCtaRef} className="flex flex-col gap-3" style={{ marginBottom: '2rem' }}>
                            <button
                                onClick={handleBuyNow}
                                disabled={!isPurchasable}
                                className="w-full font-bold uppercase tracking-wider text-white rounded-lg transition-all duration-200 cursor-pointer hover:shadow-lg active:scale-[0.98]"
                                style={{
                                    padding: '1rem', fontSize: '0.9rem',
                                    background: !isPurchasable ? '#d1d5db' : 'linear-gradient(135deg, #EFBF04, #d4a904)',
                                    letterSpacing: '0.08em',
                                    cursor: !isPurchasable ? 'not-allowed' : 'pointer',
                                    opacity: !isPurchasable ? 0.6 : 1,
                                }}
                            >
                                Buy Now
                            </button>

                            <button
                                onClick={handleAddToCart}
                                disabled={!isPurchasable}
                                className="w-full font-bold uppercase tracking-wider rounded-lg transition-all duration-200 cursor-pointer hover:bg-gray-50 active:scale-[0.98]"
                                style={{
                                    padding: '1rem', fontSize: '0.9rem',
                                    border: '2px solid #1f2937',
                                    color: !isPurchasable ? '#9ca3af' : '#1f2937',
                                    backgroundColor: 'white',
                                    letterSpacing: '0.08em',
                                    cursor: !isPurchasable ? 'not-allowed' : 'pointer',
                                    opacity: !isPurchasable ? 0.6 : 1,
                                }}
                            >
                                Add to Cart
                            </button>

                            <button
                                onClick={() => toggleWishlist(product._id, selectedColor || '', selectedSize || '')}
                                className="w-full flex items-center justify-center gap-2 font-bold uppercase tracking-wider rounded-lg transition-all duration-200 cursor-pointer active:scale-[0.98]"
                                style={{
                                    padding: '0.85rem 1rem', fontSize: '0.85rem',
                                    border: '1.5px solid #e5e7eb',
                                    color: isWishlisted(product._id) ? '#ef4444' : '#6b7280',
                                    backgroundColor: isWishlisted(product._id) ? '#fef2f2' : 'white',
                                    letterSpacing: '0.06em',
                                }}
                            >
                                <Heart className="w-[1.1rem] h-[1.1rem]" strokeWidth={2} style={{ fill: isWishlisted(product._id) ? '#ef4444' : 'none' }} />
                                {isWishlisted(product._id) ? 'Wishlisted' : 'Add to Wishlist'}
                            </button>
                        </div>

                        <hr className="border-gray-100" style={{ marginBottom: '1.5rem' }} />

                        {/* Description — collapsible on mobile, always open on desktop */}
                        <div>
                            <button
                                type="button"
                                onClick={() => setDescOpen((v) => !v)}
                                aria-expanded={descOpen}
                                className="w-full flex items-center justify-between bg-transparent border-none p-0 text-left cursor-pointer min-h-11 md:min-h-0 md:cursor-default md:pointer-events-none"
                            >
                                <span className="font-bold text-gray-900 uppercase tracking-wide" style={{ fontSize: '0.85rem' }}>
                                    Product Details
                                </span>
                                <ChevronDown
                                    className="w-4 h-4 text-gray-400 md:hidden transition-transform duration-200"
                                    style={{ transform: descOpen ? 'rotate(180deg)' : 'rotate(0)' }}
                                />
                            </button>
                            <div
                                className={`product-description text-gray-600 leading-relaxed ${descOpen ? 'block' : 'hidden'} md:block`}
                                style={{ fontSize: '0.9rem', lineHeight: '1.75', marginTop: '0.75rem', overflowWrap: 'break-word' }}
                                dangerouslySetInnerHTML={{ __html: descHtml }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Related Products */}
            <div className="max-w-7xl mx-auto">
                <RelatedProducts currentProduct={product} />
            </div>

            {/* Size Chart Modal */}
            <SizeChartModal
                isOpen={sizeChartOpen}
                onClose={() => setSizeChartOpen(false)}
                chart={sizeChart}
            />

            {/* ═══ Sticky mobile Add-to-Cart bar ═══
                Phones only. Sits just above the bottom nav; when the compare
                bar is also showing it floats above that (≈4.75rem) so they
                don't overlap. Hidden while the inline CTAs are on screen. */}
            <div
                className="md:hidden fixed left-0 right-0 bg-white border-t border-gray-200 flex items-center gap-3"
                style={{
                    bottom: compareCount > 0
                        ? 'calc(var(--pw-bottom-nav-h) + var(--pw-safe-bottom) + 4.75rem)'
                        : 'calc(var(--pw-bottom-nav-h) + var(--pw-safe-bottom))',
                    zIndex: 'var(--pw-z-fab)',
                    padding: '0.6rem 1rem',
                    boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
                    transform: stickyVisible ? 'translateY(0)' : 'translateY(130%)',
                    opacity: stickyVisible ? 1 : 0,
                    pointerEvents: stickyVisible ? 'auto' : 'none',
                    transition: 'transform 0.25s ease, opacity 0.25s ease',
                }}
            >
                <div className="flex flex-col flex-shrink-0">
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', lineHeight: 1.15 }}>
                        {formatPrice(effectivePrice)}
                    </span>
                    {!selectedSize && (
                        <span style={{ fontSize: '0.65rem', color: '#9ca3af', lineHeight: 1.1 }}>Select size</span>
                    )}
                </div>
                <button
                    onClick={handleAddToCart}
                    className="flex-1 font-bold uppercase text-white rounded-lg active:scale-[0.98] transition-transform cursor-pointer"
                    style={{
                        padding: '0.85rem',
                        fontSize: '0.85rem',
                        letterSpacing: '0.06em',
                        border: 'none',
                        background: 'linear-gradient(135deg, #EFBF04, #d4a904)',
                    }}
                >
                    Add to Cart
                </button>
            </div>
        </div>
    );
};

export default ProductDetailsPage;
