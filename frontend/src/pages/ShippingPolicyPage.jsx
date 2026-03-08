import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './RefundPolicyPage.css';

const ShippingPolicyPage = () => {
    return (
        <div className="policy-page">
            <Navbar />

            {/* ═══ Hero ═══ */}
            <section className="policy-hero">
                <h1>
                    Shipping <span>Policy</span>
                </h1>
                <p className="policy-subtitle">Pehnawa Fashion Hub</p>
            </section>

            {/* ═══ Content ═══ */}
            <div className="policy-sections">
                <section className="policy-section">
                    <p>
                        At Pehnawa Fashion Hub, we celebrate the beauty and diversity of Indian culture through
                        our unique style and elegance. Thank you for choosing us—we're honored to serve you!
                    </p>
                </section>

                <section className="policy-section">
                    <h2>Order Processing</h2>
                    <p>
                        Orders are typically processed the next business day. Once a shipping label is generated,
                        changes or cancellations are not possible. You'll receive a shipment confirmation within
                        1–2 business days.
                    </p>
                </section>

                <section className="policy-section">
                    <h2>Shipping &amp; Delivery</h2>
                    <p>
                        We ship via USPS across the USA. Delivery usually takes 3–5 working days. Priority
                        shipping is available at checkout for faster delivery (2–4 working days). Delays due to
                        USPS, weather, or other uncontrollable events may occur.
                    </p>
                </section>

                <section className="policy-section">
                    <h2>Tracking</h2>
                    <p>
                        A tracking number will be provided via email or WhatsApp once your order ships.
                    </p>
                </section>

                <section className="policy-section">
                    <h2>Need Assistance?</h2>
                    <div className="policy-contact-block">
                        <span>📞 <a href="tel:+19378389269">(937) 838-9269</a></span>
                        <span>📧 <a href="mailto:varsha.pehnawa@gmail.com">Varsha.Pehnawa@gmail.com</a></span>
                    </div>
                    <p style={{ marginTop: '1rem' }}>Or message via Instagram</p>
                </section>
            </div>

            <Footer />
        </div>
    );
};

export default ShippingPolicyPage;
