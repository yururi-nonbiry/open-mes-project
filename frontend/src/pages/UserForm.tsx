import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import authFetch, { formatFieldErrors, toApiError } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import type { ApiErrorLike } from './apiError';

interface UserFormState {
    custom_id: string;
    username: string;
    email: string;
    password: string;
    account_type: string;
    is_staff: boolean;
    is_superuser: boolean;
    is_active: boolean;
}

const emptyForm: UserFormState = {
    custom_id: '',
    username: '',
    email: '',
    password: '',
    account_type: 'human',
    is_staff: false,
    is_superuser: false,
    is_active: true,
};

// APIトークンのスコープ選択肢。backend/src/users/models.py の API_SCOPE_CHOICES と対応させる。
const API_SCOPE_CHOICES: [string, string][] = [
    ['base_api', '基本設定'],
    ['inventory_api', '在庫管理'],
    ['machine_api', '設備管理'],
    ['master_api', 'マスタ管理'],
    ['production_api', '生産管理'],
    ['quality_api', '品質管理'],
    ['users_api', 'ユーザー管理'],
];

interface TokenResponseData {
    api_token?: string | null;
    policy?: {
        is_active?: boolean;
        allowed_ips?: string;
        scopes?: string[];
    } | null;
}

interface UserPayload {
    custom_id: string;
    username: string;
    email: string | null;
    account_type: string;
    is_staff: boolean;
    is_superuser: boolean;
    is_active: boolean;
    password?: string;
    [key: string]: string | boolean | null | undefined;
}

interface TokenPolicyState {
    is_active: boolean;
    allowed_ips: string;
    scopes: string[];
}

const emptyPolicy: TokenPolicyState = {
    is_active: true,
    allowed_ips: '',
    scopes: [],
};

/**
 * サーバーのエラーレスポンスからメッセージを作る。入力値エラーは全項目分をまとめて表示する。
 */
const extractErrorMessage = async (response: Response, defaultMessage: string): Promise<string> => {
    const error = await toApiError(response, defaultMessage);
    return error.errors ? formatFieldErrors(error.errors) : error.message;
};

const UserForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const isEdit = !!id;
    const navigate = useNavigate();
    const { isSuperuser } = useAuth();

    const [form, setForm] = useState<UserFormState>(emptyForm);
    const [loading, setLoading] = useState(isEdit);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // --- 外部連携用APIトークン管理（編集モードのみ） ---
    const [apiToken, setApiToken] = useState<string | null>(null);
    const [isTokenVisible, setIsTokenVisible] = useState(false);
    const [tokenLoading, setTokenLoading] = useState(isEdit);
    const [tokenPolicy, setTokenPolicy] = useState<TokenPolicyState>(emptyPolicy);
    const [tokenMessage, setTokenMessage] = useState({ text: '', type: '' });
    const [policySubmitting, setPolicySubmitting] = useState(false);
    const [regenerating, setRegenerating] = useState(false);

    useEffect(() => {
        if (!isEdit) return;

        (async () => {
            try {
                const response = await authFetch(`/api/users/${id}/`);
                if (!response.ok) throw new Error(await extractErrorMessage(response, 'ユーザー情報の取得に失敗しました。'));
                const data = await response.json();
                setForm({
                    custom_id: data.custom_id || '',
                    username: data.username || '',
                    email: data.email || '',
                    password: '',
                    account_type: data.account_type || 'human',
                    is_staff: !!data.is_staff,
                    is_superuser: !!data.is_superuser,
                    is_active: data.is_active !== false,
                });
            } catch (e) {
                setError((e as ApiErrorLike).message);
            } finally {
                setLoading(false);
            }
        })();
    }, [id, isEdit]);

    const applyTokenResponseData = (data: TokenResponseData) => {
        setApiToken(data.api_token || null);
        if (data.policy) {
            setTokenPolicy({
                is_active: data.policy.is_active !== false,
                allowed_ips: data.policy.allowed_ips || '',
                scopes: data.policy.scopes || [],
            });
        }
    };

    useEffect(() => {
        if (!isEdit) return;

        (async () => {
            setTokenLoading(true);
            try {
                const response = await authFetch(`/api/users/${id}/token/`);
                if (!response.ok) throw new Error(await extractErrorMessage(response, 'APIトークン情報の取得に失敗しました。'));
                const data = await response.json();
                applyTokenResponseData(data);
            } catch (e) {
                setTokenMessage({ text: (e as ApiErrorLike).message, type: 'danger' });
            } finally {
                setTokenLoading(false);
            }
        })();
    }, [id, isEdit]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!isEdit && form.password.length < 5) {
            setError('パスワードは5文字以上で入力してください。');
            return;
        }

        setSubmitting(true);
        try {
            const payload: UserPayload = {
                custom_id: form.custom_id,
                username: form.username,
                email: form.email || null,
                account_type: form.account_type,
                is_staff: form.is_staff,
                is_superuser: form.is_superuser,
                is_active: form.is_active,
            };
            // 編集時、パスワード欄が空なら変更しない
            if (form.password) {
                payload.password = form.password;
            }

            const url = isEdit ? `/api/users/${id}/` : '/api/users/';
            const method = isEdit ? 'PATCH' : 'POST';
            const response = await authFetch(url, {
                method,
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(await extractErrorMessage(response, 'ユーザーの保存に失敗しました。'));

            navigate('/user/management', {
                state: {
                    message: isEdit ? 'ユーザーを更新しました。' : 'ユーザーを作成しました。',
                    messageType: 'success',
                },
            });
        } catch (e) {
            setError((e as ApiErrorLike).message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRegenerateToken = async () => {
        if (!window.confirm('APIトークンを再生成しますか？現在のトークンは無効になります。')) {
            return;
        }
        setRegenerating(true);
        setTokenMessage({ text: '', type: '' });
        try {
            const response = await authFetch(`/api/users/${id}/token/`, { method: 'POST' });
            if (!response.ok) throw new Error(await extractErrorMessage(response, 'トークンの再生成に失敗しました。'));
            const data = await response.json();
            applyTokenResponseData(data);
            setIsTokenVisible(true);
            setTokenMessage({ text: 'APIトークンを再生成しました。', type: 'success' });
        } catch (e) {
            setTokenMessage({ text: (e as ApiErrorLike).message, type: 'danger' });
        } finally {
            setRegenerating(false);
        }
    };

    const handleScopeToggle = (scopeKey: string) => {
        setTokenPolicy(prev => {
            const has = prev.scopes.includes(scopeKey);
            return {
                ...prev,
                scopes: has ? prev.scopes.filter(s => s !== scopeKey) : [...prev.scopes, scopeKey],
            };
        });
    };

    const handlePolicySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPolicySubmitting(true);
        setTokenMessage({ text: '', type: '' });
        try {
            const response = await authFetch(`/api/users/${id}/token/`, {
                method: 'PATCH',
                body: JSON.stringify(tokenPolicy),
            });
            if (!response.ok) throw new Error(await extractErrorMessage(response, 'アクセス制御ポリシーの保存に失敗しました。'));
            const data = await response.json();
            applyTokenResponseData(data);
            setTokenMessage({ text: 'アクセス制御ポリシーを保存しました。', type: 'success' });
        } catch (e) {
            setTokenMessage({ text: (e as ApiErrorLike).message, type: 'danger' });
        } finally {
            setPolicySubmitting(false);
        }
    };

    if (loading) {
        return <div className="goods-receipt-page text-center py-5 text-muted">読み込み中...</div>;
    }

    return (
        <div className="goods-receipt-page" style={{ maxWidth: '720px' }}>
            <div className="goods-receipt-filter-panel mb-3 d-flex justify-content-between align-items-center">
                <div className="fw-bold text-dark">
                    {isEdit ? `ユーザー情報の編集（ID: ${form.custom_id}）` : '新規ユーザーアカウント作成'}
                </div>
                <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm fw-bold"
                    onClick={() => navigate('/user/management')}
                >
                    ← ユーザー一覧に戻る
                </button>
            </div>

            {error && <div className="alert alert-danger shadow-sm">{error}</div>}

            <div className="goods-receipt-table-card p-4">
                <form onSubmit={handleSubmit}>
                    <div className="mb-3">
                        <label htmlFor="custom_id" className="receipt-filter-label">専用ID <span className="text-danger">*</span></label>
                        <input
                            type="text"
                            id="custom_id"
                            name="custom_id"
                            className="form-control"
                            value={form.custom_id}
                            onChange={handleChange}
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <label htmlFor="username" className="receipt-filter-label">ユーザー名</label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            className="form-control"
                            value={form.username}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="mb-3">
                        <label htmlFor="email" className="receipt-filter-label">メールアドレス</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            className="form-control"
                            value={form.email}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="mb-3">
                        <label htmlFor="password" className="receipt-filter-label">
                            {isEdit ? '新しいパスワード（変更する場合のみ入力）' : 'パスワード'} {!isEdit && <span className="text-danger">*</span>}
                        </label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            className="form-control"
                            value={form.password}
                            onChange={handleChange}
                            minLength={5}
                            required={!isEdit}
                            autoComplete="new-password"
                        />
                    </div>
                    <div className="mb-3">
                        <label htmlFor="account_type" className="receipt-filter-label">アカウント区分</label>
                        <select
                            id="account_type"
                            name="account_type"
                            className="form-select"
                            value={form.account_type}
                            onChange={handleChange}
                        >
                            <option value="human">通常ユーザー</option>
                            <option value="system">システム連携用</option>
                        </select>
                        <div className="form-text">
                            「システム連携用」は、外部システムからAPIトークンで接続するための専用アカウントであることを示す区分です。
                        </div>
                    </div>
                    <div className="p-3 rounded-3 bg-light border mb-4">
                        <div className="form-check mb-2">
                            <input
                                type="checkbox"
                                id="is_staff"
                                name="is_staff"
                                className="form-check-input"
                                checked={form.is_staff}
                                onChange={handleChange}
                            />
                            <label className="form-check-label fw-bold text-dark" htmlFor="is_staff">スタッフ権限（管理画面・設定メニューへのアクセス可）</label>
                        </div>
                        <div className="form-check mb-2">
                            <input
                                type="checkbox"
                                id="is_superuser"
                                name="is_superuser"
                                className="form-check-input"
                                checked={form.is_superuser}
                                onChange={handleChange}
                                disabled={!isSuperuser}
                            />
                            <label className="form-check-label fw-bold text-dark" htmlFor="is_superuser">スーパーユーザー権限</label>
                            {!isSuperuser && <div className="form-text">スーパーユーザー権限を変更できるのはスーパーユーザーのみです。</div>}
                        </div>
                        <div className="form-check">
                            <input
                                type="checkbox"
                                id="is_active"
                                name="is_active"
                                className="form-check-input"
                                checked={form.is_active}
                                onChange={handleChange}
                            />
                            <label className="form-check-label fw-bold text-dark" htmlFor="is_active">アカウントを有効にする</label>
                        </div>
                    </div>

                    <div className="d-flex justify-content-end gap-2">
                        <button
                            type="button"
                            className="btn btn-outline-secondary px-4 fw-bold"
                            onClick={() => navigate('/user/management')}
                        >
                            キャンセル
                        </button>
                        <button type="submit" className="btn btn-primary px-4 fw-bold shadow-sm" disabled={submitting}>
                            {submitting ? '保存中...' : '保存する'}
                        </button>
                    </div>
                </form>
            </div>

            {isEdit && (
                <div className="goods-receipt-table-card p-4 mt-4">
                    <h5 className="fw-bold text-dark mb-3 pb-2 border-bottom" style={{ fontSize: '0.98rem' }}>
                        APIトークン管理（外部システム連携用）
                    </h5>
                    <div>
                        {tokenMessage.text && (
                            <div className={`alert alert-${tokenMessage.type}`}>{tokenMessage.text}</div>
                        )}
                        {tokenLoading ? (
                            <p className="text-muted">読み込み中...</p>
                        ) : (
                            <>
                                <div className="p-3 bg-light rounded-3 border mb-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
                                    <div>
                                        <span className="small fw-bold text-secondary d-block mb-1">現在のAPIトークン</span>
                                        <span style={{ wordBreak: 'break-all' }} className="font-monospace text-dark fw-semibold">
                                            {apiToken ? (isTokenVisible ? apiToken : '•'.repeat(40)) : 'トークンが見つかりません。'}
                                        </span>
                                    </div>
                                    <div className="d-flex gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-secondary fw-bold"
                                            onClick={() => setIsTokenVisible(!isTokenVisible)}
                                            disabled={!apiToken}
                                        >
                                            {isTokenVisible ? '非表示' : '表示する'}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline-warning btn-sm fw-bold"
                                            onClick={handleRegenerateToken}
                                            disabled={regenerating}
                                        >
                                            {regenerating ? '再生成中...' : 'トークンを発行/再生成'}
                                        </button>
                                    </div>
                                </div>

                                <form onSubmit={handlePolicySubmit}>
                                    <div className="form-check mb-3">
                                        <input
                                            type="checkbox"
                                            id="policy_is_active"
                                            className="form-check-input"
                                            checked={tokenPolicy.is_active}
                                            onChange={(e) => setTokenPolicy(prev => ({ ...prev, is_active: e.target.checked }))}
                                        />
                                        <label className="form-check-label fw-bold text-dark" htmlFor="policy_is_active">
                                            このトークンを有効にする
                                        </label>
                                    </div>

                                    <div className="mb-3">
                                        <label htmlFor="policy_allowed_ips" className="receipt-filter-label">接続許可IPアドレス</label>
                                        <textarea
                                            id="policy_allowed_ips"
                                            className="form-control font-monospace"
                                            rows={3}
                                            placeholder="例: 203.0.113.10&#10;198.51.100.0/24"
                                            value={tokenPolicy.allowed_ips}
                                            onChange={(e) => setTokenPolicy(prev => ({ ...prev, allowed_ips: e.target.value }))}
                                        />
                                        <div className="form-text">1行または1カンマ区切りにつき1つ、IPアドレスまたはCIDR表記。空欄の場合は制限しません。</div>
                                    </div>

                                    <div className="mb-3">
                                        <label className="receipt-filter-label d-block">アクセス許可API（スコープ）</label>
                                        <div className="d-flex flex-wrap gap-3 p-2 bg-light rounded border">
                                            {API_SCOPE_CHOICES.map(([key, label]) => (
                                                <div className="form-check mb-0" key={key}>
                                                    <input
                                                        type="checkbox"
                                                        className="form-check-input"
                                                        id={`scope_${key}`}
                                                        checked={tokenPolicy.scopes.includes(key)}
                                                        onChange={() => handleScopeToggle(key)}
                                                    />
                                                    <label className="form-check-label text-dark" htmlFor={`scope_${key}`}>{label}</label>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="form-text">未選択（すべて外す）の場合は全アプリにアクセス可能です。</div>
                                    </div>

                                    <div className="d-flex justify-content-end">
                                        <button type="submit" className="btn btn-primary btn-sm px-3 fw-bold shadow-sm" disabled={policySubmitting}>
                                            {policySubmitting ? '保存中...' : 'アクセス制御ポリシーを保存'}
                                        </button>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserForm;
