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
        { id: 9, name: 'Kidswear' },
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
        <div className="w-full flex flex-col justify-center items-center" style={{ paddingTop: '3rem', paddingBottom: '6rem', gap: '3rem', background: 'linear-gradient(to bottom, #FAD76C 0%, #FAD76C 85%, #FFFFFF 100%)' }}>
            {/* Section Title */}
            <div className="flex justify-center items-center">
                <h2 className="text-5xl font-light text-gray-900 tracking-wide uppercase">
                    Shop by Category
                </h2>
            </div>

            {/* Categories Grid */}
            <div className="grid grid-cols-6" style={{ gap: '2.5rem' }}>
                {categories.map((category) => {
                    const cover = covers[category.name];
                    const coverImage = cover?.image || null;

                    return (
                        <div
                            key={category.id}
                            className="group cursor-pointer"
                            style={{ width: '14rem' }}
                            onClick={() => navigate(`/products/${encodeURIComponent(category.name)}`)}
                        >
                            {/* Category Image */}
                            <div className="aspect-square bg-stone-100 rounded-lg overflow-hidden relative" style={{ marginBottom: '0.75rem' }}>
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
                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                            </div>

                            {/* Category Name */}
                            <p className="text-sm font-medium text-gray-900 uppercase tracking-wider text-center">
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
