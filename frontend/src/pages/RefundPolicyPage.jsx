import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './RefundPolicyPage.css';

const RefundPolicyPage = () => {
    return (
        <div className="policy-page">
            <Navbar />

            {/* ═══ Hero ═══ */}
            <section className="policy-hero">
                <h1>
                    Refund <span>Policy</span>
                </h1>
                <p className="policy-subtitle">All Sales Are Final</p>
            </section>

            {/* ═══ Content ═══ */}
            <div className="policy-sections">
                <section className="policy-section">
                    <p>
                        At PehnawA Fashion Hub, all orders are final once placed. We do not accept returns or
                        exchanges.
                    </p>
                    <p>However, in the rare case that your item arrives damaged:</p>
                    <ul>
                        <li>
                            Customers must notify us within 24 hours of receiving the package.
                        </li>
                        <li>
                            A complete unboxing video (from start to finish) and clear photos of the damaged item
                            must be provided as proof.
                        </li>
                        <li>
                            Once the claim is reviewed and approved, the damaged item must be shipped back within
                            1–2 days of confirmation.
                        </li>
                        <li>
                            Items must be unused, unwashed, unworn, and in original packaging with all tags
                            intact.
                        </li>
                    </ul>
                    <p>
                        PehnawA Fashion Hub reserves the right to approve or decline any return request based on
                        the evidence provided.
                    </p>
                    <p>
                        We sincerely value your trust and carefully inspect every outfit to ensure the highest
                        quality before dispatch.
                    </p>
                </section>
            </div>

            <Footer />
        </div>
    );
};

export default RefundPolicyPage;
