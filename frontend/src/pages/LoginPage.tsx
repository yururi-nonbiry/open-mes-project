import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import LoginCaptcha from '../components/LoginCaptcha';
import { useLogin } from '../hooks/useLogin';
import './LoginPage.css'; // Add some basic styling

interface LoginPageProps {
  onLoginSuccess: () => Promise<void>;
  isAuthenticated: boolean;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, isAuthenticated }) => {
  const [customId, setCustomId] = useState('');
  const [password, setPassword] = useState('');
  const { error, captcha, captchaValue, setCaptchaValue, refreshCaptcha, submitting, login } = useLogin(onLoginSuccess);
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/";

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(customId, password);
  };

  if (isAuthenticated) {
    return null; // Or a loading spinner, while the redirect happens
  }

  return (
    <div className="login-page-container">
      <div className="login-card">
        <h2 className="login-title">生産ナビ</h2>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <input
              type="text"
              id="custom_id"
              className="form-control"
              placeholder="ID"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <input
              type="password"
              id="password"
              className="form-control"
              placeholder="パスワード"
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
                inputClassName="form-control"
              />
            </div>
          )}
          <div className="form-group">
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary btn-block"
              style={{ backgroundColor: '#007bff', borderColor: '#007bff' }}
            >
              ログイン
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;