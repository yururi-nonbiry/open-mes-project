import React from 'react';
import type { Captcha } from '../services/securityService';

interface LoginCaptchaProps {
    captcha: Captcha;
    value: string;
    onChange: (value: string) => void;
    onRefresh: () => void;
    inputClassName?: string;
}

/** ログイン失敗が続いたときに表示する画像認証の入力欄 */
const LoginCaptcha: React.FC<LoginCaptchaProps> = ({ captcha, value, onChange, onRefresh, inputClassName }) => (
    <div className="login-captcha">
        <label htmlFor="captcha_value">画像に表示された文字を入力してください</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
            <img src={captcha.image} alt="画像認証" width={150} height={50} style={{ border: '1px solid #ccc' }} />
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onRefresh}>
                別の画像
            </button>
        </div>
        <input
            type="text"
            id="captcha_value"
            className={inputClassName}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            required
        />
    </div>
);

export default LoginCaptcha;
