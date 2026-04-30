import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Heart, Ruler } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
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
import { getSizeChart } from '../utils/sizeCharts.js';
import RelatedProducts from '../components/RelatedProducts';
import SizeChartModal from '../components/SizeChartModal';

const ProductDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToCart, openCart, setBuyNowItem } = useCart();
    const { isWishlisted, toggleWishlist } = useWishlist();

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedImage, setSelectedImage] = useState(0);
    const [selectedSize, setSelectedSize] = useState(null);
    const [selectedColor, setSelectedColor] = useState(null);
    const [sizeChartOpen, setSizeChartOpen] = useState(false);

    useEffect(() => {
        const fetchProduct = async () => {
            try {
                setLoading(true);
                const response = await fetch(`${import.meta.env.VITE_API_URL}/products/${id}`);
                const data = await response.json();
                if (!data.success) throw new Error(data.message || 'Product not found');
                setProduct(data.product);
                setSelectedColor(defaultColor(data.product));
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchProduct();
    }, [id]);

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
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Breadcrumb */}
            <div className="border-b border-gray-100" style={{ padding: '0.75rem clamp(1rem, 4vw, 2rem)' }}>
                <div className="max-w-7xl mx-auto flex items-center gap-2 text-sm text-gray-500">
                    <button onClick={() => navigate('/')} className="flex items-center gap-1 hover:text-gray-800 transition-colors cursor-pointer">
                        <ChevronLeft className="w-4 h-4" /> Home
                    </button>
                    <span>/</span>
                    <button onClick={() => navigate(`/products/${product.category}`)} className="hover:text-gray-800 transition-colors cursor-pointer" style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit' }}>
                        {product.category}
                    </button>
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
                                <img src={mainImageUrl} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
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
                                        <img src={img.url} alt={`${product.name} ${index + 1}`} className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ═══════════ RIGHT — Product Details ═══════════ */}
                    <div className="w-full md:flex-1">
                        {/* Category */}
                        <p className="uppercase tracking-widest font-semibold" style={{ fontSize: '0.7rem', color: '#EFBF04', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
                            {product.category}
                        </p>

                        {/* Product Name */}
                        <h1 className="font-bold text-gray-900 leading-tight" style={{ fontSize: '1.85rem', marginBottom: '0.5rem' }}>
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
                                                        <img src={previewImg} alt={colorName} className="w-full h-full object-cover" />
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
                                            className="flex items-center gap-1.5 cursor-pointer transition-colors"
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
                        <div className="flex flex-col gap-3" style={{ marginBottom: '2rem' }}>
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

                        {/* Description */}
                        <div>
                            <p className="font-bold text-gray-900 uppercase tracking-wide" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                                Product Details
                            </p>
                            <div
                                className="product-description text-gray-600 leading-relaxed"
                                style={{ fontSize: '0.9rem', lineHeight: '1.75' }}
                                dangerouslySetInnerHTML={{ __html: product.description }}
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
        </div>
    );
};

export default ProductDetailsPage;
