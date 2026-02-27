import React, { useState } from 'react';
import api from '../api/axiosConfig';

const Login = ({ onLoginSuccess }) => {
    console.log("Login: component mounting...");
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [view, setView] = useState('login'); // 'login', 'forgot', or 'signup'


    const handleEmailLogin = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const response = await api.post('/api/auth/email', {
                email: email,
                password: password
            });

            if (response.data.status === 'success') {
                onLoginSuccess(response.data.user);
            } else {
                setError('Authentication failed.');
            }
        } catch (err) {
            console.error("[Login Error]", {
                message: err.message,
                status: err.response?.status,
                data: err.response?.data,
                config: {
                    url: err.config?.url,
                    baseURL: err.config?.baseURL,
                    method: err.config?.method
                }
            });
            const errorMsg = err.response?.data?.error || 'Failed to sign in. Please try again.';
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/api/auth/signup', {
                name: name,
                email: email,
                password: password
            });

            if (response.data.status === 'success') {
                setSuccessMsg("Account created successfully! You can now sign in.");
                setView('login');
                // Clear sensitive fields
                setPassword('');
                setConfirmPassword('');
            }
        } catch (err) {
            console.error("[Signup Error]", {
                message: err.message,
                status: err.response?.status,
                data: err.response?.data
            });
            const errorMsg = err.response?.data?.error || 'Failed to create account. Please try again.';
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };


    const handleForgotPassword = (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Mock sending OTP
        setTimeout(() => {
            setLoading(false);
            setSuccessMsg(`OTP has been sent to ${email}`);
        }, 1500);
    };

    return (
        <div className="login-container">
            <div className="three-d-bg">
                <div className="cosmic-stars">
                    {[...Array(50)].map((_, i) => (
                        <div key={i} className="star" style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 3}s`
                        }}></div>
                    ))}
                </div>
                <div className="nebula-wrapper">
                    <div className="nebula nebula-cyan"></div>
                    <div className="nebula nebula-purple"></div>
                </div>
                <div className="shooting-stars">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="shooting-star" style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 40}%`,
                            animationDelay: `${Math.random() * 10}s`
                        }}></div>
                    ))}
                </div>
                <div className="cube-wrapper">
                    <div className="cube cube-1"></div>
                    <div className="cube cube-2"></div>
                    <div className="cube cube-3"></div>
                </div>
            </div>

            <div className="login-card">

                <div className="login-header">
                    <div style={{ marginBottom: '1.5rem' }}>
                        <img
                            src="/bg.png"
                            alt="EduWrite Logo"
                            style={{ width: '120px', height: 'auto', filter: 'drop-shadow(0 0 10px rgba(0, 210, 255, 0.5))' }}
                        />
                    </div>
                    <h1>
                        {view === 'login' && 'Welcome To EduWrite AI'}
                        {view === 'signup' && 'Create Account'}
                        {view === 'forgot' && 'Reset Password'}
                    </h1>
                    <p>
                        {view === 'login' && 'Sign in to continue to EduWrite AI'}
                        {view === 'signup' && 'Join the EduWrite AI community today'}
                        {view === 'forgot' && 'Enter your email to receive an OTP'}
                    </p>
                </div>

                {error && <div className="error-message">{error}</div>}
                {successMsg && <div className="success-message">{successMsg}</div>}

                {view === 'login' ? (
                    <>
                        <form className="login-form" onSubmit={handleEmailLogin}>
                            <div className="input-group">
                                <label>Email Address*</label>
                                <input
                                    type="email"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="input-group">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label>Password*</label>
                                    <span
                                        className="forgot-link"
                                        onClick={() => { setView('forgot'); setError(null); setSuccessMsg(null); }}
                                    >
                                        Forgot Password?
                                    </span>
                                </div>
                                <div className="password-input-wrapper">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex="-1"
                                    >
                                        {showPassword ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>
                            <button type="submit" className="login-btn" disabled={loading}>
                                {loading ? 'Signing In...' : 'Sign In'}
                            </button>
                        </form>


                        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                Don't have an account? <span className="forgot-link" onClick={() => { setView('signup'); setError(null); setSuccessMsg(null); }}>Create Account</span>
                            </p>
                        </div>
                    </>
                ) : view === 'signup' ? (
                    <form className="login-form" onSubmit={handleSignup}>
                        <div className="input-group">
                            <label>Full Name*</label>
                            <input
                                type="text"
                                placeholder="John Doe"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label>Email Address*</label>
                            <input
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label>Password*</label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex="-1"
                                >
                                    {showPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>
                        <div className="input-group">
                            <label>Confirm Password*</label>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex="-1"
                                >
                                    {showPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>
                        <button type="submit" className="login-btn" disabled={loading}>
                            {loading ? 'Creating Account...' : 'Submit Details'}
                        </button>
                        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                            <span
                                className="forgot-link"
                                onClick={() => { setView('login'); setError(null); setSuccessMsg(null); }}
                            >
                                Back to Login
                            </span>
                        </div>
                    </form>
                ) : (
                    <form className="login-form" onSubmit={handleForgotPassword}>
                        <div className="input-group">
                            <label>Email Address*</label>
                            <input
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" className="login-btn" disabled={loading}>
                            {loading ? 'Sending...' : 'Send OTP'}
                        </button>
                        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                            <span
                                className="forgot-link"
                                onClick={() => { setView('login'); setError(null); setSuccessMsg(null); }}
                            >
                                Back to Login
                            </span>
                        </div>
                    </form>
                )}

            </div>
        </div>
    );
};

export default Login;
