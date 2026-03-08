import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './AboutUsPage.css';

const AboutUsPage = () => {
    return (
        <div className="about-us-page">
            <Navbar />

            {/* ═══ Hero ═══ */}
            <section className="about-hero">
                <h1>
                    Welcome to <span>Pehnawa Fashion Hub</span>
                </h1>
                <p className="hero-intro">
                    Welcome to PehnawaFashionHub.com, your trusted destination for premium Indian ethnic wear
                    online. Whether you're shopping for women's ethnic wear, men's traditional outfits, or kids
                    ethnic wear from newborn to adults (up to size 52/54), Pehnawa Fashion Hub brings you a curated
                    collection for every celebration and season.
                </p>
                <p className="hero-intro" style={{ marginTop: '1rem' }}>
                    From everyday elegance to grand festive and wedding looks, we blend tradition, craftsmanship,
                    and modern style—all in one place.
                </p>
            </section>

            {/* ═══ Content sections ═══ */}
            <div className="about-sections">
                {/* --- Explore Our Collection --- */}
                <section className="about-section">
                    <h2>Explore Our Indian Ethnic Wear Collection</h2>
                    <p>
                        At Pehnawa Fashion Hub, we proudly offer an extensive collection of ethnic wear for women,
                        men, and kids, designed to suit every occasion—festivals, weddings, engagements, parties,
                        and family functions.
                    </p>

                    <h3>Women's Ethnic Wear</h3>
                    <p>Discover a wide variety of styles, including:</p>
                    <ul>
                        <li>Sarees &amp; Designer Sarees</li>
                        <li>Anarkali Suits</li>
                        <li>Kurta Sets &amp; Sharara Sets</li>
                        <li>Lehenga Choli</li>
                        <li>Indo-Western Outfits</li>
                        <li>Ethnic Tops, Crop Tops &amp; Skirt Sets</li>
                    </ul>
                    <p>
                        Our women's collection ranges from comfortable cotton ethnic wear to royal and luxury
                        festive ensembles, ensuring you look elegant and confident on every occasion.
                    </p>
                </section>

                {/* --- Best Ethnic Wear --- */}
                <section className="about-section">
                    <h2>Best Ethnic Wear for Women</h2>
                    <p>
                        Our women's ethnic wear collection is thoughtfully designed for all body types, offering
                        sizes from regular to XXL and plus sizes. Whether you prefer:
                    </p>
                    <ul>
                        <li>Soft cotton ethnic wear for everyday comfort</li>
                        <li>Rich festive wear with hand embroidery, gota patti &amp; zardozi</li>
                        <li>Modern ethnic styles like crop tops with skirts or fusion sets</li>
                    </ul>
                    <p>
                        You'll find the perfect outfit that balances tradition with contemporary fashion.
                    </p>
                </section>

                {/* --- Men's Ethnic Wear --- */}
                <section className="about-section">
                    <h2>Men's Ethnic Wear Collection</h2>
                    <p>
                        Pehnawa Fashion Hub also features a stylish range of men's ethnic wear, perfect for
                        weddings, festivals, and special occasions:
                    </p>
                    <ul>
                        <li>Kurta Pajama Sets</li>
                        <li>Sherwanis</li>
                        <li>Indo-Western Outfits</li>
                        <li>Festive &amp; Wedding Wear</li>
                    </ul>
                    <p>
                        Available in sizes from small to adult 52/54, our men's collection ensures comfort,
                        elegance, and a perfect fit.
                    </p>
                </section>

                {/* --- Kids Ethnic Wear --- */}
                <section className="about-section">
                    <h2>Kids Ethnic Wear – Newborn to Adult Sizes</h2>
                    <p>
                        We believe style has no age limit! Our kids ethnic wear collection includes:
                    </p>
                    <ul>
                        <li>Newborn ethnic sets</li>
                        <li>Toddler &amp; kids festive wear</li>
                        <li>Matching ethnic outfits for boys &amp; girls</li>
                    </ul>
                    <p>
                        From newborns to teenagers and adult sizes, our kidswear is designed to be comfortable,
                        skin-friendly, and celebration-ready.
                    </p>
                </section>

                {/* --- Trends --- */}
                <section className="about-section">
                    <h2>Trends in Ethnic Wear</h2>
                    <p>Stay updated with the latest ethnic fashion trends:</p>
                    <ul>
                        <li>Elegant ethnic wear with dupattas</li>
                        <li>Hand-embroidered details</li>
                        <li>Indo-Western fusion styles</li>
                        <li>Lightweight festive silhouettes</li>
                    </ul>
                    <p>
                        Our collections are crafted to help you stand out while staying rooted in tradition.
                    </p>
                </section>

                {/* --- Every Season --- */}
                <section className="about-section">
                    <h2>Ethnic Wear for Every Season</h2>
                    <p>
                        Comfort meets style at Pehnawa Fashion Hub. Our breathable cotton ethnic wear is ideal
                        for:
                    </p>
                    <ul>
                        <li>Daily wear</li>
                        <li>Casual gatherings</li>
                        <li>Daytime events &amp; parties</li>
                    </ul>
                    <p>
                        For grand evenings, explore our luxurious fabrics like silk, georgette, chiffon, organza,
                        and shimmer.
                    </p>
                </section>

                {/* --- Special Occasions --- */}
                <section className="about-section">
                    <h2>Ethnic Wear for Special Occasions</h2>

                    <h3>Wedding Ethnic Wear</h3>
                    <p>
                        From bridal styles to wedding guest outfits, our wedding collection features:
                    </p>
                    <ul>
                        <li>Sarees &amp; Lehenga Sets</li>
                        <li>Heavy handwork suits</li>
                        <li>Royal festive ensembles</li>
                    </ul>

                    <h3>Festive Ethnic Wear</h3>
                    <p>
                        Celebrate festivals like Diwali, Holi, Navratri, Eid &amp; more with outfits that reflect
                        your unique style—traditional or modern.
                    </p>

                    <h3>Engagement Ethnic Wear</h3>
                    <p>
                        Our engagement collection blends elegance and craftsmanship to make your special day
                        unforgettable.
                    </p>
                </section>

                {/* --- Why Choose --- */}
                <section className="about-section" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                    <h2>Why Choose Pehnawa Fashion Hub?</h2>
                    <div className="why-choose-grid">
                        <div className="why-choose-card">
                            <div className="card-icon">✨</div>
                            <h4>Exclusive &amp; Distinct Designs</h4>
                            <p>Unique, hand-picked ethnic styles</p>
                        </div>
                        <div className="why-choose-card">
                            <div className="card-icon">✨</div>
                            <h4>Quality &amp; Comfort</h4>
                            <p>Premium fabrics with flawless finishing</p>
                        </div>
                        <div className="why-choose-card">
                            <div className="card-icon">✨</div>
                            <h4>Sizes for Everyone</h4>
                            <p>From newborns to adult sizes 52/54</p>
                        </div>
                        <div className="why-choose-card">
                            <div className="card-icon">✨</div>
                            <h4>One-Stop Ethnic Store</h4>
                            <p>Women's wear, men's wear, kids wear &amp; accessories</p>
                        </div>
                    </div>
                </section>
            </div>

            {/* ═══ CTA ═══ */}
            <section className="about-cta">
                <p>
                    If you're looking to refresh your wardrobe or dress up for a wedding, festival, or
                    celebration, Pehnawa Fashion Hub has something for everyone.
                </p>
                <p className="cta-highlight">
                    ✨ Shop with us and experience the beauty of ethnic fashion—where tradition meets modern
                    elegance. ✨
                </p>
            </section>

            <Footer />
        </div>
    );
};

export default AboutUsPage;
