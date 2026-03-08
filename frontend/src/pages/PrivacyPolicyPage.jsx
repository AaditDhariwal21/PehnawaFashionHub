import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './PrivacyPolicyPage.css';

const PrivacyPolicyPage = () => {
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return (
        <div className="privacy-page">
            <Navbar />

            {/* ═══ Hero ═══ */}
            <section className="privacy-hero">
                <h1>
                    Privacy <span>Policy</span>
                </h1>
                <p className="last-updated">Last Updated: {formattedDate}</p>
            </section>

            {/* ═══ Content ═══ */}
            <div className="privacy-sections">
                {/* Intro */}
                <div className="privacy-intro">
                    <p>
                        At Pehnawa Fashion Hub, we value your privacy and are committed to protecting your
                        personal information. This Privacy Policy outlines how we collect, use, and safeguard
                        your information when you visit our website or make a purchase from us.
                    </p>
                    <p>
                        By accessing or using our website, you agree to the terms outlined in this policy.
                    </p>
                </div>

                {/* 1. Information We Collect */}
                <section className="privacy-section">
                    <h2>1. Information We Collect</h2>
                    <p>
                        When you visit or shop with Pehnawa Fashion Hub, we may collect the following
                        information:
                    </p>

                    <h3>Personal Information:</h3>
                    <ul>
                        <li>Full Name</li>
                        <li>Email Address</li>
                        <li>Phone Number</li>
                        <li>Shipping &amp; Billing Address</li>
                    </ul>

                    <h3>Payment Information:</h3>
                    <p>
                        All payments are securely processed through trusted third-party payment gateways. We do
                        not store or have access to your credit or debit card information.
                    </p>

                    <h3>Technical Information:</h3>
                    <ul>
                        <li>IP Address</li>
                        <li>Browser Type</li>
                        <li>Device Information</li>
                        <li>Website usage data (for analytics and performance improvement)</li>
                    </ul>
                </section>

                {/* 2. How We Use Your Information */}
                <section className="privacy-section">
                    <h2>2. How We Use Your Information</h2>
                    <p>We use your personal information to:</p>
                    <ul>
                        <li>Process and fulfill your orders</li>
                        <li>Provide shipping confirmations and order updates</li>
                        <li>Respond to customer service inquiries</li>
                        <li>Send promotional emails or updates (only if you subscribe)</li>
                        <li>Improve website functionality and customer experience</li>
                        <li>Comply with legal and accounting obligations</li>
                    </ul>
                    <p>
                        We do not sell, trade, or rent your personal information to third parties.
                    </p>
                </section>

                {/* 3. Payment Security */}
                <section className="privacy-section">
                    <h2>3. Payment Security</h2>
                    <p>Your security is our priority.</p>
                    <ul>
                        <li>
                            All transactions are encrypted and processed through secure payment gateways.
                        </li>
                        <li>We do not store payment card details.</li>
                        <li>Your financial data remains protected at all times.</li>
                    </ul>
                </section>

                {/* 4. Cookies */}
                <section className="privacy-section">
                    <h2>4. Cookies &amp; Website Analytics</h2>
                    <p>Our website may use cookies to:</p>
                    <ul>
                        <li>Enhance your browsing experience</li>
                        <li>Remember preferences</li>
                        <li>Analyze website traffic and performance</li>
                    </ul>
                    <p>
                        You may disable cookies in your browser settings; however, some features of the website
                        may not function properly.
                    </p>
                </section>

                {/* 5. Third-Party Services */}
                <section className="privacy-section">
                    <h2>5. Third-Party Services</h2>
                    <p>
                        We may share limited information with trusted third-party providers such as:
                    </p>
                    <ul>
                        <li>Shipping carriers</li>
                        <li>Payment processors</li>
                        <li>Website analytics services</li>
                    </ul>
                    <p>
                        These partners only receive necessary information to perform their services and are
                        required to maintain confidentiality.
                    </p>
                </section>

                {/* 6. Data Protection */}
                <section className="privacy-section">
                    <h2>6. Data Protection</h2>
                    <p>
                        We implement appropriate security measures to protect your personal information from
                        unauthorized access, misuse, or disclosure. While no online platform can guarantee
                        absolute security, we take reasonable steps to safeguard your data.
                    </p>
                </section>

                {/* 7. Policy Updates */}
                <section className="privacy-section">
                    <h2>7. Policy Updates</h2>
                    <p>
                        Pehnawa Fashion Hub reserves the right to update or modify this Privacy Policy at any
                        time. Any changes will be reflected on this page with an updated revision date.
                    </p>
                </section>

                {/* 8. Contact Us */}
                <section className="privacy-section">
                    <h2>8. Contact Us</h2>
                    <p>
                        If you have any questions about this Privacy Policy or how your information is handled,
                        please contact us:
                    </p>
                    <div className="privacy-contact-block">
                        <span>📞 <a href="tel:+19378389269">+1 (937) 838-9269</a></span>
                        <span>📧 <a href="mailto:varsha.pehnawa@gmail.com">varsha.pehnawa@gmail.com</a></span>
                    </div>
                </section>
            </div>

            <Footer />
        </div>
    );
};

export default PrivacyPolicyPage;
