import Navbar from '../components/Navbar';
import NewArrivalsSection from '../components/NewArrivalsSection';
import ShopByCategorySection from '../components/ShopByCategorySection';
import Footer from '../components/Footer';

const HomePage = () => {

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Banner — image already contains branded text */}
            <section className="w-full">
                <img
                    src="/PehnawaHeroBanner.webp"
                    alt="Pehnawa — Where Tradition Meets Style"
                    className="w-full h-auto block"
                />
            </section>

            <NewArrivalsSection />
            <ShopByCategorySection />
            <Footer />
        </div>
    );
};

export default HomePage;
