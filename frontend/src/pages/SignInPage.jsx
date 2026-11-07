import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../utils/toast';

/** Only same-site paths may be used as a post-login redirect. */
const safeRedirectPath = (value) =>
    typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null;

const SignInPage = () => {
    const location = useLocation();
    /* Optional router state (never the URL, so nothing sensitive is logged or
       shared): `from` to return to after sign-in, `mode`/`email` to open the
       sign-up form pre-filled, and `claimToken` to attach a guest order to the
       account once signed in (see /api/orders/guest/claim). */
    const authState = location.state || {};
    const [isSignUp, setIsSignUp] = useState(authState.mode === 'signup');
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState(typeof authState.email === 'string' ? authState.email : '');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { login } = useAuth();
    const toast = useToast();

    const API_BASE_URL = import.meta.env.VITE_API_URL;

    /**
     * Where to go once signed in. Admins always go to the dashboard, as before.
     * A guest who came here to keep their order gets it attached first; if
     * that fails (e.g. a different email), they are taken back to the order.
     */
    const finishAuth = async (data) => {
        const firstName = String(data.user?.name || '').trim().split(/\s+/)[0];
        toast.success(isSignUp
            ? 'Account created. Welcome to Pehnawa!'
            : `Welcome back${firstName ? `, ${firstName}` : ''}!`);

        if (data.user.role === 'admin') {
            navigate('/adminDashboard');
            return;
        }

        if (typeof authState.claimToken === 'string' && data.token) {
            try {
                const res = await fetch(`${API_BASE_URL}/orders/guest/claim`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${data.token}`,
                    },
                    body: JSON.stringify({ token: authState.claimToken }),
                });
                const claim = await res.json();
                if (claim.success && claim.order?._id) {
                    toast.success('Your order has been added to your account');
                    navigate(`/account/orders/${claim.order._id}`);
                    return;
                }
            } catch (err) {
                console.error('Order claim error:', err);
            }
            navigate(`/order-details#t=${authState.claimToken}`);
            return;
        }

        navigate(safeRedirectPath(authState.from) || '/');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (isSignUp) {
                // Sign Up
                if (!fullName || !email || !password || !confirmPassword) {
                    setError('Please fill in all fields');
                    setIsLoading(false);
                    return;
                }
                if (password !== confirmPassword) {
                    setError('Passwords do not match');
                    setIsLoading(false);
                    return;
                }

                const response = await fetch(`${API_BASE_URL}/auth/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: fullName, email, password }),
                });

                const data = await response.json();

                if (!response.ok) {
                    setError(data.message || 'Sign up failed');
                    setIsLoading(false);
                    return;
                }

                // Store token and user info
                login(data.user, data.token);

                await finishAuth(data);
            } else {
                // Sign In
                if (!email || !password) {
                    setError('Please fill in all fields');
                    setIsLoading(false);
                    return;
                }

                const response = await fetch(`${API_BASE_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });

                const data = await response.json();

                if (!response.ok) {
                    setError(data.message || 'Login failed');
                    setIsLoading(false);
                    return;
                }

                // Store token and user info
                login(data.user, data.token);

                await finishAuth(data);
            }
        } catch (err) {
            console.error('Auth error:', err);
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };


    const passwordsMatch = password.length >= 3 && confirmPassword.length >= 3 && password === confirmPassword;
    const signInReady = password.length >= 3;

    return (
        <div className="w-full min-h-screen flex justify-center items-center px-4 py-8 md:p-0" style={{ backgroundColor: '#F5F5F5' }}>
            {/* Sign In/Up Box */}
            <div
                className={`rounded-xl flex flex-col items-center justify-center w-full max-w-[30rem] px-6 py-8 md:px-[3.125rem] md:py-10 ${isSignUp ? 'md:min-h-[34rem]' : 'md:min-h-[32rem]'}`}
                style={{
                    backgroundColor: '#FFFFFF',
                    border: '0.0625rem solid #FAD76C',
                    boxShadow: '0 0 1.25rem rgba(250, 215, 108, 0.5), 0 0 2.5rem rgba(250, 215, 108, 0.3)',
                }}
            >
                {/* Initial Logo */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ width: '2.5rem', height: '2.5rem' }} className="rounded-full border border-amber-500 flex items-center justify-center">
                        <span className="text-amber-600 font-serif text-lg italic">P</span>
                    </div>
                </div>

                {/* Title Section */}
                <div className="w-full" style={{ marginBottom: '1.25rem' }}>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">
                        {isSignUp ? 'Welcome to Pehnawa!' : 'Sign in'}
                    </h1>
                    <p className="text-base text-gray-500">
                        {isSignUp ? "Let's create your account" : 'Welcome back to Pehnawa'}
                    </p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="w-full mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-red-600 text-sm">{error}</p>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="w-full">
                    {/* Full Name - Only for Sign Up */}
                    {isSignUp && (
                        <input
                            type="text"
                            placeholder="Full Name"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            style={{ marginBottom: '1rem', paddingLeft: '1rem', paddingRight: '1rem' }}
                            className="w-full h-11 md:h-10 bg-white border border-gray-200 rounded-md text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm"
                        />
                    )}

                    {/* Email Input */}
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{ marginBottom: '1rem', paddingLeft: '1rem', paddingRight: '1rem' }}
                        className="w-full h-11 md:h-10 bg-white border border-gray-200 rounded-md text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm"
                    />

                    {/* Password Input */}
                    <div className="relative" style={{ marginBottom: '1rem' }}>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ paddingLeft: '1rem', paddingRight: '3rem' }}
                            className="w-full h-11 md:h-10 bg-white border border-gray-200 rounded-md text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 h-11 w-11 md:h-auto md:w-auto flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                        >
                            {showPassword ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            )}
                        </button>
                    </div>

                    {/* Confirm Password - Only for Sign Up */}
                    {isSignUp && (
                        <div className="relative" style={{ marginBottom: '1rem' }}>
                            <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                placeholder="Confirm Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                style={{ paddingLeft: '1rem', paddingRight: '3rem' }}
                                className="w-full h-11 md:h-10 bg-white border border-gray-200 rounded-md text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 h-11 w-11 md:h-auto md:w-auto flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                            >
                                {showConfirmPassword ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        style={{
                            backgroundColor: (isSignUp ? passwordsMatch : signInReady) ? '#EFBF04' : undefined
                        }}
                        className={`w-full h-11 md:h-10 rounded-md font-bold transition-all text-base cursor-pointer ${(isSignUp ? passwordsMatch : signInReady)
                            ? 'text-white hover:opacity-90'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            } ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {isLoading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Sign In')}
                    </button>

                    {/* "or" divider, then the link to switch between signing in and
                        creating an account — below the main button, where a
                        customer who doesn't have an account yet looks next. */}
                    <div className="flex items-center w-full" style={{ marginTop: '1.5rem', marginBottom: '1rem' }} role="separator" aria-label="or">
                        <div className="flex-1 border-t border-gray-200"></div>
                        <span className="px-4 text-sm text-gray-400">or</span>
                        <div className="flex-1 border-t border-gray-200"></div>
                    </div>
                    <p className="text-sm text-gray-500 text-center">
                        Click here to{' '}
                        <button
                            type="button"
                            className="cursor-pointer hover:text-blue-600 transition-colors inline-block py-1 bg-transparent border-none p-0 min-h-11 md:min-h-0"
                            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
                        >
                            {isSignUp ? 'sign into your account' : 'create an account'}
                        </button>
                    </p>
                </form>

            </div>
        </div>
    );
};

export default SignInPage;
