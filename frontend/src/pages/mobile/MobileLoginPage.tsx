import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginCaptcha from '../../components/LoginCaptcha';
import { useLogin } from '../../hooks/useLogin';
import './MobileLoginPage.css';

const MobileLoginPage = ({ onLoginSuccess, isAuthenticated }) => {
    const [customId, setCustomId] = useState('');
    const [password, setPassword] = useState('');
    const { error, captcha, captchaValue, setCaptchaValue, refreshCaptcha, submitting, login } = useLogin(onLoginSuccess);
    const navigate = useNavigate();

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            // For mobile, always redirect to the mobile top page after login.
            navigate('/mobile', { replace: true });
        }
    }, [isAuthenticated, navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        await login(customId, password);
    };

    if (isAuthenticated) {
        return null; // Or a loading spinner
    }

    return (
        <div className="mobile-login-container">
            <h2>ログイン</h2>
            {error && <p className="error-message">{error}</p>}

            <form onSubmit={handleLogin} className="mobile-login-form">
                <div className="form-group">
                    <label htmlFor="custom_id">ID:</label>
                    <input
                        type="text"
                        id="custom_id"
                        name="custom_id"
                        value={customId}
                        onChange={(e) => setCustomId(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password">パスワード:</label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                {captcha && (
                    <div className="form-group">
                        <LoginCaptcha
                            captcha={captcha}
                            value={captchaValue}
                            onChange={setCaptchaValue}
                            onRefresh={refreshCaptcha}
                        />
                    </div>
                )}
                <div className="form-group">
                    <button type="submit" disabled={submitting}>ログイン</button>
                </div>
            </form>
        </div>
    );
};

export default MobileLoginPage;