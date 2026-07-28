import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CloudinaryImage from './CloudinaryImage.jsx';
import { ALL_CATEGORIES } from '../utils/productCategories.js';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const ShopByCategorySection = () => {
    const navigate = useNavigate();
    const [covers, setCovers] = useState({});

    /* Derived from the shared taxonomy, not a hand-maintained list. That drops
       "New Arrivals" — which was never a category, only a special tag, so the
       tile led to an empty page — and "Pashminas", now merged into Dupattas.
       Layout is unchanged; only the data source is. */
    const categories = ALL_CATEGORIES.map((name) => ({ id: name, name }));

    useEffect(() => {
        const fetchCovers = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/products/categories/covers`);
                const data = await res.json();
                if (data.success) {
                    setCovers(data.covers);
                }
            } catch (err) {
                console.error('Failed to fetch category covers', err);
            }
        };
        fetchCovers();
    }, []);

    return (
        <div
            className="w-full flex flex-col items-center"
            style={{
                paddingTop: 'clamp(1rem, 2vw, 1.75rem)',
                paddingBottom: 'clamp(3.5rem, 7vw, 8rem)',
                gap: 'clamp(1.25rem, 3vw, 3.5rem)',
                // White section of the alternating theme (the yellow now
                // lives in the Bestsellers band above); flows into the
                // white footer.
                background: '#FFFFFF',
            }}
        >
            {/* Section Title */}
            <h2
                className="font-light text-gray-900 tracking-wide uppercase text-center px-4"
                style={{ fontSize: 'clamp(1.25rem, 3.5vw, 3rem)' }}
            >
                Shop by Category
            </h2>

            {/*
                Column counts are 2 / 3 / 4 / 6 across the breakpoints. The tile
                count is no longer hardcoded — it is however many categories the
                taxonomy declares — so the "every row is exactly full" property
                is no longer guaranteed by construction. It happens to hold at
                the current count of 12, which all four column counts divide.

                If a future category count leaves a remainder, the final row
                simply left-aligns, which is normal for a product grid. Grid
                `1fr` tracks stretch the tiles to fill the row, and the wide
                max-width keeps them large without side gutters up to ~1800px.
            */}
            <div
                className="
                    grid w-full mx-auto px-4 sm:px-6 md:px-10 lg:px-12
                    grid-cols-2
                    sm:grid-cols-3
                    md:grid-cols-4
                    lg:grid-cols-6
                "
                style={{
                    gap: 'clamp(1rem, 1.8vw, 2.25rem)',
                    maxWidth: '1800px',
                }}
            >
                {categories.map((category) => {
                    const cover = covers[category.name];
                    const coverImage = cover?.image || null;

                    return (
                        <div
                            key={category.id}
                            className="group cursor-pointer"
                            onClick={() => navigate(`/products/${encodeURIComponent(category.name)}`)}
                        >
                            {/* Category Image */}
                            <div className="aspect-square bg-stone-100 rounded-lg overflow-hidden relative mb-2">
                                {coverImage ? (
                                    <CloudinaryImage
                                        src={coverImage}
                                        alt={category.name}
                                        preset="cover"
                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-b from-stone-200 to-stone-300 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                                        <div className="w-12 h-12 rounded-full bg-stone-400/30"></div>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                            </div>

                            {/* Category Name */}
                            <p
                                className="font-medium text-gray-900 uppercase tracking-wider text-center mt-1.5"
                                style={{ fontSize: 'clamp(0.68rem, 1.4vw, 0.875rem)' }}
                            >
                                {category.name}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ShopByCategorySection;
