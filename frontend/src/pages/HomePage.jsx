import Navbar from '../components/Navbar';
import NewArrivalsSection from '../components/NewArrivalsSection';
import ShopByCategorySection from '../components/ShopByCategorySection';
import Footer from '../components/Footer';

const HomePage = () => {

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Banner */}
            <section className="w-full">
                <img
                    src="/PehnawaHeroBanner.webp"
                    alt="Pehnawa — Where Tradition Meets Style"
                    style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block',
                        objectFit: 'cover',
                    }}
                />
            </section>

            <NewArrivalsSection />
            <ShopByCategorySection />
            <Footer />
        </div>
    );
};

export default HomePage;
