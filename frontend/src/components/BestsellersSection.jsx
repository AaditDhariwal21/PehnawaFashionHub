import { useState, useEffect } from 'react';
import ProductCarousel from './ProductCarousel';

/*
 * Bestsellers — home-page rail of products tagged "Bestseller" in specialTags.
 * Reuses the shared ProductCarousel (same conveyor animation and card as
 * New Arrivals). It is the yellow band in the alternating home-page
 * theme, sitting between New Arrivals (white) and Shop by Category
 * (white). Renders nothing when there are no Best Seller products.
 */
const BestsellersSection = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await fetch(
                    `${import.meta.env.VITE_API_URL}/products/tag/${encodeURIComponent('Bestseller')}`
                );
                const data = await response.json();
                if (data.success) {
                    setProducts(data.products);
                }
            } catch (error) {
                console.error('Error fetching bestsellers:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    // Once loaded, hide the whole section (and its yellow band) if the
    // store has no Best Seller products — matches RelatedProducts.
    if (!loading && products.length === 0) return null;

    return (
        <div
            className="w-full flex flex-col items-center"
            style={{
                paddingTop: 'clamp(1.25rem, 3.5vw, 3rem)',
                paddingBottom: 'clamp(2rem, 5vw, 6rem)',
                gap: 'clamp(1rem, 2.5vw, 3rem)',
                // Yellow section of the alternating theme: starts yellow to
                // blend with the New Arrivals fade above, ends white to
                // blend into Shop by Category below.
                background: 'linear-gradient(to bottom, #FAD76C 0%, #FAD76C 85%, #FFFFFF 100%)',
            }}
        >
            {/* Section Title */}
            <h2
                className="font-light text-gray-900 tracking-wide uppercase text-center px-4"
                style={{ fontSize: 'clamp(1.25rem, 3.5vw, 3rem)' }}
            >
                Bestsellers
            </h2>

            <ProductCarousel products={products} loading={loading} />
        </div>
    );
};

export default BestsellersSection;
