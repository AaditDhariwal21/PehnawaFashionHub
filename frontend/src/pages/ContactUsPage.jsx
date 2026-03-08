import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './ContactUsPage.css';

const ContactUsPage = () => {
    return (
        <div className="contact-us-page">
            <Navbar />

            {/* ═══ Hero ═══ */}
            <section className="contact-hero">
                <h1>
                    Contact <span>Us</span>
                </h1>
                <p className="hero-subtitle">Connect With Pehnawa Fashion Hub</p>
                <p className="hero-intro">
                    At Pehnawa Fashion Hub, every celebration matters — and so does every customer.
                </p>
                <p className="hero-intro">
                    Whether you're selecting the perfect wedding ensemble, coordinating family outfits, or
                    choosing a festive look, our team is here to provide personalized assistance with elegance
                    and care.
                </p>
            </section>

            {/* ═══ Content sections ═══ */}
            <div className="contact-sections">
                {/* --- Private Client Assistance --- */}
                <section className="contact-section">
                    <h2>
                        <span className="section-emoji">📞</span> Private Client Assistance
                    </h2>
                    <div className="contact-info-grid">
                        <div className="contact-info-card">
                            <p className="card-label">Phone</p>
                            <a href="tel:+19378389269">+1 (937) 838-9269</a>
                        </div>
                        <div className="contact-info-card">
                            <p className="card-label">Email</p>
                            <a href="mailto:varsha.pehnawa@gmail.com">varsha.pehnawa@gmail.com</a>
                        </div>
                    </div>
                    <p>
                        For styling guidance, size assistance (Newborn to 52/54), wedding consultations, or bulk
                        orders, we are just a call or message away.
                    </p>
                </section>

                {/* --- WhatsApp Concierge --- */}
                <section className="contact-section">
                    <h2>
                        <span className="section-emoji">💬</span> WhatsApp Concierge Service
                    </h2>
                    <p>For faster assistance, connect with us directly on WhatsApp:</p>
                    <a
                        href="https://wa.me/19378389269"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="whatsapp-btn"
                    >
                        💬 Chat on WhatsApp
                    </a>
                    <p style={{ marginTop: '1.2rem' }}>Our WhatsApp concierge service allows you to:</p>
                    <ul>
                        <li>View detailed outfit videos</li>
                        <li>Get real-time size recommendations</li>
                        <li>Request additional pictures</li>
                        <li>Reserve pieces instantly</li>
                    </ul>
                </section>

                {/* --- Customer Care Hours --- */}
                <section className="contact-section">
                    <h2>
                        <span className="section-emoji">🕒</span> Customer Care Hours
                    </h2>
                    <div className="hours-block">
                        <p className="days">Monday – Saturday</p>
                        <p className="time">10:00 AM – 8:00 PM (EST)</p>
                    </div>
                    <p style={{ marginTop: '1rem' }}>
                        We aim to respond to all inquiries within 24–48 hours.
                    </p>
                </section>
            </div>

            {/* ═══ CTA ═══ */}
            <section className="contact-cta">
                <h2>Experience Personalized Ethnic Luxury</h2>
                <p>
                    From intimate gatherings to grand wedding celebrations, Pehnawa Fashion Hub offers refined
                    Indian ethnic wear for women, men, and children across the USA.
                </p>
                <p>We look forward to styling your special moments.</p>
                <p className="brand-line">✨ Pehnawa Fashion Hub</p>
                <p className="tagline">Timeless Tradition. Modern Elegance. ✨</p>
            </section>

            <Footer />
        </div>
    );
};

export default ContactUsPage;
