import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const ShopByCategorySection = () => {
    const navigate = useNavigate();
    const [covers, setCovers] = useState({});

    const categories = [
        { id: 1, name: 'New Arrivals' },
        { id: 2, name: 'Anarkalis' },
        { id: 3, name: 'Coord Sets' },
        { id: 4, name: 'Lehangas' },
        { id: 5, name: 'Indo Western' },
        { id: 6, name: 'Suits & Kurtis' },
        { id: 7, name: 'Sarees' },
        { id: 8, name: 'Blouses' },
        { id: 9, name: 'Kids' },
        { id: 10, name: "Men's Kurta" },
        { id: 11, name: 'Dupattas' },
        { id: 12, name: 'Pashminas' },
    ];

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
                background: 'linear-gradient(to bottom, #FAD76C 0%, #FAD76C 88%, #FFFFFF 100%)',
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
                12 categories → equal rows at every breakpoint:
                  default : 2 cols ×  6 rows
                  ≥640px  : 3 cols ×  4 rows
                  ≥768px  : 4 cols ×  3 rows
                  ≥1024px : 6 cols ×  2 rows
            */}
            <div
                className="
                    grid w-full lg:w-[80vw] mx-auto px-4 sm:px-6 md:px-8
                    grid-cols-2
                    sm:grid-cols-3
                    md:grid-cols-4
                    lg:grid-cols-6
                "
                style={{
                    gap: 'clamp(1rem, 1.8vw, 2.25rem)',
                    maxWidth: '1600px',
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
                                    <img
                                        src={coverImage}
                                        alt={category.name}
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
