import { useCallback, useState } from 'react';
import securityService, { Captcha } from '../services/securityService';
import { ApiError, formatFieldErrors, toApiError } from '../utils/api';

/**
 * ログイン処理(PC・モバイル共通)。
 * ログイン失敗が続くとサーバーが captcha_required を返すので、画像認証を表示して次の送信に答えを添える。
 * 画像は1回の送信で使えなくなるため、失敗のたびに新しい画像を取得する。
 */
export const useLogin = (onLoginSuccess: () => Promise<void>) => {
    const [error, setError] = useState('');
    const [captcha, setCaptcha] = useState<Captcha | null>(null);
    const [captchaValue, setCaptchaValue] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const refreshCaptcha = useCallback(async () => {
        setCaptchaValue('');
        try {
            setCaptcha(await securityService.getCaptcha());
        } catch (err) {
            setCaptcha(null);
            setError(err instanceof Error ? err.message : String(err));
        }
    }, []);

    const login = useCallback(async (customId: string, password: string) => {
        setError('');
        setSubmitting(true);
        try {
            let response: Response | null = null;
            let networkFailed = false;

            try {
                response = await fetch('/api/users/token/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // CustomUserのUSERNAME_FIELDである'custom_id'をキーとして送信
                    body: JSON.stringify({
                        custom_id: customId,
                        password,
                        ...(captcha ? { captcha_key: captcha.key, captcha_value: captchaValue } : {}),
                    }),
                });
            } catch {
                networkFailed = true;
            }

            // バックエンド未起動時（プロキシ500/502/504またはネットワーク失敗）のローカル確認用ログイン
            if ((networkFailed || (response && response.status >= 500)) && customId === 'admin' && password === 'admin') {
                localStorage.setItem('access_token', 'local-dev-admin-token');
                localStorage.setItem('refresh_token', 'local-dev-admin-refresh');
                setCaptcha(null);
                await onLoginSuccess();
                return;
            }

            if (!response) {
                setError('バックエンドサーバーに接続できませんでした。');
                return;
            }

            if (response.ok) {
                const data = await response.json();
                // トークンをlocalStorageに保存
                localStorage.setItem('access_token', data.access);
                localStorage.setItem('refresh_token', data.refresh);
                setCaptcha(null);
                // Appコンポーネントにログイン成功を通知
                await onLoginSuccess();
                return;
            }

            const apiError: ApiError = await toApiError(
                response,
                'ログインに失敗しました。IDとパスワードを確認してください。'
            );
            setError(apiError.errors ? formatFieldErrors(apiError.errors) : apiError.message);
            if (apiError.body?.captcha_required) {
                await refreshCaptcha();
            } else {
                setCaptcha(null);
            }
        } catch (err) {
            console.error('Login request failed:', err);
            setError('ログイン中にエラーが発生しました。時間をおいて再度お試しください。');
        } finally {
            setSubmitting(false);
        }
    }, [captcha, captchaValue, onLoginSuccess, refreshCaptcha]);

    return { error, captcha, captchaValue, setCaptchaValue, refreshCaptcha, submitting, login };
};
