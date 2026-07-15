import { useState, useEffect } from 'react';
import ProductCarousel from './ProductCarousel';

const NewArrivalsSection = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await fetch(
                    `${import.meta.env.VITE_API_URL}/products/tag/${encodeURIComponent('New Arrival')}`
                );
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

    return (
        <div
            className="w-full flex flex-col items-center"
            style={{
                paddingTop: 'clamp(1.25rem, 3.5vw, 3rem)',
                paddingBottom: 'clamp(2rem, 5vw, 6rem)',
                gap: 'clamp(1rem, 2.5vw, 3rem)',
                // White section of the alternating theme; fades into the
                // yellow Bestsellers band below.
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

            {/* Topmost product rail, just below the hero — its first row is
                above the fold, so eager-load those images at high priority. */}
            <ProductCarousel products={products} loading={loading} eager />
        </div>
    );
};

export default NewArrivalsSection;
