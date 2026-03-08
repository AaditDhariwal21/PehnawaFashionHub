import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './RefundPolicyPage.css';

const TermsOfServicePage = () => {
    return (
        <div className="policy-page">
            <Navbar />

            {/* ═══ Hero ═══ */}
            <section className="policy-hero">
                <h1>
                    Terms of <span>Service</span>
                </h1>
                <p className="policy-subtitle">Pehnawa Fashion Hub</p>
            </section>

            {/* ═══ Content ═══ */}
            <div className="policy-sections">
                <section className="policy-section">
                    <p>
                        Welcome to Pehnawa Fashion Hub! By browsing or placing an order on our website, you agree
                        to the terms outlined below. Please read carefully before purchasing.
                    </p>
                </section>

                {/* 1. About Our Products */}
                <section className="policy-section">
                    <h2>1. About Our Products</h2>
                    <ul>
                        <li>
                            We strive to present each item as accurately as possible through photos and
                            descriptions.
                        </li>
                        <li>
                            Slight variations in color, texture, or embroidery may occur due to lighting or
                            screen settings.
                        </li>
                        <li>
                            Every piece is handcrafted, so minor differences are natural and part of its charm.
                        </li>
                    </ul>
                </section>

                {/* 2. Orders & Payment */}
                <section className="policy-section">
                    <h2>2. Orders &amp; Payment</h2>
                    <ul>
                        <li>Orders cannot be canceled, altered, or refunded once confirmed.</li>
                        <li>All prices are in USD and may change without prior notice.</li>
                        <li>
                            Payments are securely processed through our trusted online gateways.
                        </li>
                    </ul>
                </section>

                {/* 3. Shipping & Delivery */}
                <section className="policy-section">
                    <h2>3. Shipping &amp; Delivery</h2>
                    <ul>
                        <li>We ship across the United States.</li>
                        <li>
                            Shipping costs and estimated delivery times are shown at checkout.
                        </li>
                        <li>
                            Pehnawa Fashion Hub is not responsible for delays caused by carriers.
                        </li>
                    </ul>
                </section>

                {/* 4. Returns & Damages */}
                <section className="policy-section">
                    <h2>4. Returns &amp; Damages</h2>
                    <ul>
                        <li>
                            All purchases are final. Returns or exchanges are generally not accepted.
                        </li>
                        <li>If an item arrives damaged or defective, please:</li>
                    </ul>
                    <ol>
                        <li>Notify us within 24 hours of delivery.</li>
                        <li>Share an unboxing video and clear photos for verification.</li>
                        <li>Ship the item back within 1–2 days once approved.</li>
                    </ol>
                    <ul>
                        <li>
                            Claims without proper proof or after the timeframe may not be honored.
                        </li>
                    </ul>
                </section>

                {/* 5. Custom & Made-to-Order Items */}
                <section className="policy-section">
                    <h2>5. Custom &amp; Made-to-Order Items</h2>
                    <ul>
                        <li>
                            Personalized or custom outfits are non-returnable and non-exchangeable.
                        </li>
                        <li>
                            Ensure your measurements are accurate, as we cannot take responsibility for fit
                            issues caused by incorrect sizing.
                        </li>
                    </ul>
                </section>

                {/* 6. Content & Intellectual Property */}
                <section className="policy-section">
                    <h2>6. Content &amp; Intellectual Property</h2>
                    <ul>
                        <li>
                            All images, text, and designs on our site are owned by Pehnawa Fashion Hub.
                        </li>
                        <li>
                            Copying, sharing, or using our materials without permission is strictly prohibited.
                        </li>
                    </ul>
                </section>

                {/* 7. Privacy & Security */}
                <section className="policy-section">
                    <h2>7. Privacy &amp; Security</h2>
                    <ul>
                        <li>
                            Your personal information is secure and used only for fulfilling orders.
                        </li>
                        <li>We do not store or share payment details.</li>
                    </ul>
                </section>

                {/* 8. Acceptance */}
                <section className="policy-section">
                    <h2>8. Acceptance</h2>
                    <p>
                        By using our website or placing an order, you confirm that you have read, understood, and
                        agreed to Pehnawa Fashion Hub's terms, shipping, and return policies.
                    </p>
                </section>
            </div>

            {/* ═══ CTA ═══ */}
            <section className="policy-cta">
                <p>
                    Thank you for supporting Pehnawa Fashion Hub, where each outfit reflects a blend of
                    traditional craftsmanship and modern style.
                </p>
            </section>

            <Footer />
        </div>
    );
};

export default TermsOfServicePage;
