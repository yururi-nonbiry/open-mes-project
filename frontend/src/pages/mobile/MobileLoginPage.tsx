import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toApiError } from '../../utils/api';
import './MobileLoginPage.css';

const MobileLoginPage = ({ onLoginSuccess, isAuthenticated }) => {
    const [customId, setCustomId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
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
        setError('');

        try {
            const response = await fetch('/api/users/token/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // CustomUserのUSERNAME_FIELDである'custom_id'をキーとして送信
                body: JSON.stringify({ custom_id: customId, password }),
            });

            if (response.ok) {
                const data = await response.json();
                // トークンをlocalStorageに保存
                localStorage.setItem('access_token', data.access);
                localStorage.setItem('refresh_token', data.refresh);
                await onLoginSuccess();
            } else {
                const error = await toApiError(response, 'ログインに失敗しました。ユーザー名とパスワードを確認してください。');
                setError(error.message);
            }
        } catch (err) {
            console.error('ログインリクエスト失敗:', err);
            setError('ログイン中にエラーが発生しました。再度試してください。');
        }
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
                <div className="form-group">
                    <button type="submit">ログイン</button>
                </div>
            </form>
        </div>
    );
};

export default MobileLoginPage;