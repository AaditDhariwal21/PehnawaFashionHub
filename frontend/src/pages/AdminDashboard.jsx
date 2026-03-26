import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ProductUploadModal from '../components/ProductUploadModal';

const AdminDashboard = () => {
    const { user, isLoggedIn, logout } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        // Only redirect to signin on initial load when not logged in.
        // During logout, handleLogout navigates to '/' directly.
        if (!isLoggedIn && !user) {
            navigate('/');
            return;
        }
        if (user && user.role !== 'admin') {
            navigate('/');
            return;
        }
    }, [isLoggedIn, user, navigate]);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const handleProductSuccess = (product) => {
        setSuccessMessage(`Product "${product.name}" created successfully!`);
        setTimeout(() => setSuccessMessage(''), 5000);
    };

    if (!user || user.role !== 'admin') {
        return (
            <div className="w-full h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: '#EFBF04' }}></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
            {/* Header */}
            <header
                className="sticky top-0 z-40 w-full"
                style={{
                    backgroundColor: '#FFFFFF',
                    borderBottom: '2px solid #FAD76C',
                    boxShadow: '0 4px 20px rgba(250, 215, 108, 0.3)'
                }}
            >
                <div className="w-full flex items-center justify-between" style={{ padding: '1.25rem 2.5rem' }}>
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <div
                            className="w-12 h-12 rounded-full border-2 flex items-center justify-center"
                            style={{ borderColor: '#EFBF04' }}
                        >
                            <span className="font-serif text-xl italic" style={{ color: '#EFBF04' }}>P</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
                            <p className="text-sm text-gray-500">Pehnawa</p>
                        </div>
                    </div>

                    {/* User Info & Logout */}
                    <div className="flex items-center gap-5">
                        <div className="text-right">
                            <p className="text-md font-medium text-gray-900">{user.name}</p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="text-sm font-medium transition-all cursor-pointer rounded-md"
                            style={{
                                padding: '10px 16px',
                                border: '1.5px solid #EFBF04',
                                color: '#EFBF04',
                                backgroundColor: 'transparent'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.backgroundColor = '#EFBF04';
                                e.target.style.color = '#FFFFFF';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.backgroundColor = 'transparent';
                                e.target.style.color = '#EFBF04';
                            }}
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main style={{ padding: '2.5rem 3rem' }}>
                {/* Success Message */}
                {successMessage && (
                    <div
                        className="mb-6 p-4 rounded-lg flex items-center gap-3"
                        style={{
                            backgroundColor: 'rgba(239, 191, 4, 0.1)',
                            border: '1px solid #EFBF04'
                        }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="#EFBF04">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <p className="text-gray-800">{successMessage}</p>
                    </div>
                )}

                {/* Welcome Section */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h2 className="text-3xl font-bold text-gray-900 mb-1">
                        Welcome back, <span style={{ color: '#EFBF04' }}>{user.name}</span>
                    </h2>
                    <p className="text-md text-gray-500">Manage your products and store from here.</p>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {/* Upload New Product Card */}
                    <div
                        className="rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
                        style={{
                            backgroundColor: '#FFFFFF',
                            border: '2px solid #FAD76C',
                            boxShadow: '0 2px 12px rgba(250, 215, 108, 0.15)',
                            padding: '1.5rem'
                        }}
                        onClick={() => setIsModalOpen(true)}
                    >
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
                            style={{ backgroundColor: 'rgba(239, 191, 4, 0.15)' }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="#EFBF04">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <h3 className="text-base font-bold text-gray-900 mb-1">Upload New Product</h3>
                        <p className="text-sm text-gray-500">Add a new product to your store with images and details.</p>
                    </div>

                    {/* Manage All Products Card */}
                    <div
                        className="rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
                        style={{
                            backgroundColor: '#FFFFFF',
                            border: '2px solid #FAD76C',
                            boxShadow: '0 2px 12px rgba(250, 215, 108, 0.15)',
                            padding: '1.5rem'
                        }}
                        onClick={() => navigate('/admin/manage-products')}
                    >
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
                            style={{ backgroundColor: 'rgba(239, 191, 4, 0.15)' }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="#EFBF04">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                        <h3 className="text-base font-bold text-gray-900 mb-1">Manage All Products</h3>
                        <p className="text-sm text-gray-500">View, edit and delete your store products.</p>
                    </div>

                    {/* View Orders Card */}
                    <div
                        className="rounded-xl cursor-pointer transition-all hover:scale-[1.02]"
                        style={{
                            backgroundColor: '#FFFFFF',
                            border: '2px solid #FAD76C',
                            boxShadow: '0 2px 12px rgba(250, 215, 108, 0.15)',
                            padding: '1.5rem'
                        }}
                        onClick={() => navigate('/admin/orders')}
                    >
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
                            style={{ backgroundColor: 'rgba(239, 191, 4, 0.15)' }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="#EFBF04">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                        <h3 className="text-base font-bold text-gray-900 mb-1">View Orders</h3>
                        <p className="text-sm text-gray-500">View and manage all customer orders.</p>
                    </div>
                </div>
            </main>

            {/* Product Upload Modal */}
            <ProductUploadModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={handleProductSuccess}
            />
        </div>
    );
};

export default AdminDashboard;
