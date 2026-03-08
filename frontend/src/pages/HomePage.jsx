import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import NewArrivalsSection from '../components/NewArrivalsSection';
import ShopByCategorySection from '../components/ShopByCategorySection';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';

const HomePage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (user?.role === 'admin') {
            navigate('/adminDashboard', { replace: true });
        }
    }, [user, navigate]);

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
