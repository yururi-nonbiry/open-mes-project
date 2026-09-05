import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import authFetch from '../utils/api';

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
 * サーバーのエラーレスポンスから可能な限り具体的なメッセージを抽出する。
 * DRFのシリアライザバリデーションエラーは { field_name: ["エラー内容", ...] } の形式で返る。
 */
const extractErrorMessage = async (response: Response, defaultMessage: string): Promise<string> => {
    try {
        const data = await response.json();
        if (typeof data?.detail === 'string') return data.detail;
        if (data && typeof data === 'object') {
            const parts = Object.entries(data).map(([field, messages]) => {
                const msg = Array.isArray(messages) ? messages.join(' ') : String(messages);
                return `${field}: ${msg}`;
            });
            if (parts.length > 0) return parts.join(' / ');
        }
    } catch {
        // JSON以外のレスポンスは無視してデフォルトメッセージを使う
    }
    return defaultMessage;
};

const UserForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const isEdit = !!id;
    const navigate = useNavigate();

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
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [id, isEdit]);

    const applyTokenResponseData = (data: any) => {
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
            } catch (e: any) {
                setTokenMessage({ text: e.message, type: 'danger' });
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
            const payload: Record<string, any> = {
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
        } catch (e: any) {
            setError(e.message);
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
        } catch (e: any) {
            setTokenMessage({ text: e.message, type: 'danger' });
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
        } catch (e: any) {
            setTokenMessage({ text: e.message, type: 'danger' });
        } finally {
            setPolicySubmitting(false);
        }
    };

    if (loading) {
        return <div className="container mt-4">読み込み中...</div>;
    }

    return (
        <div className="container mt-4" style={{ maxWidth: '600px' }}>
            <h1>{isEdit ? 'ユーザー編集' : '新規ユーザー作成'}</h1>

            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={handleSubmit}>
                <div className="mb-3">
                    <label htmlFor="custom_id" className="form-label">専用ID</label>
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
                    <label htmlFor="username" className="form-label">ユーザー名</label>
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
                    <label htmlFor="email" className="form-label">メールアドレス</label>
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
                    <label htmlFor="password" className="form-label">
                        {isEdit ? '新しいパスワード（変更する場合のみ入力）' : 'パスワード'}
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
                    <label htmlFor="account_type" className="form-label">アカウント区分</label>
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
                <div className="form-check mb-2">
                    <input
                        type="checkbox"
                        id="is_staff"
                        name="is_staff"
                        className="form-check-input"
                        checked={form.is_staff}
                        onChange={handleChange}
                    />
                    <label className="form-check-label" htmlFor="is_staff">スタッフ権限</label>
                </div>
                <div className="form-check mb-2">
                    <input
                        type="checkbox"
                        id="is_superuser"
                        name="is_superuser"
                        className="form-check-input"
                        checked={form.is_superuser}
                        onChange={handleChange}
                    />
                    <label className="form-check-label" htmlFor="is_superuser">スーパーユーザー権限</label>
                </div>
                <div className="form-check mb-4">
                    <input
                        type="checkbox"
                        id="is_active"
                        name="is_active"
                        className="form-check-input"
                        checked={form.is_active}
                        onChange={handleChange}
                    />
                    <label className="form-check-label" htmlFor="is_active">有効</label>
                </div>

                <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? '保存中...' : '保存'}
                </button>
                <button
                    type="button"
                    className="btn btn-secondary ms-2"
                    onClick={() => navigate('/user/management')}
                >
                    キャンセル
                </button>
            </form>

            {isEdit && (
                <div className="card mt-4">
                    <div className="card-header">
                        <h3 className="h5 mb-0">APIトークン管理（外部システム連携用）</h3>
                    </div>
                    <div className="card-body">
                        {tokenMessage.text && (
                            <div className={`alert alert-${tokenMessage.type}`}>{tokenMessage.text}</div>
                        )}
                        {tokenLoading ? (
                            <p>読み込み中...</p>
                        ) : (
                            <>
                                <p>
                                    <strong>APIトークン:</strong>
                                    <span style={{ wordBreak: 'break-all' }} className="ms-2 font-monospace">
                                        {apiToken ? (isTokenVisible ? apiToken : '•'.repeat(40)) : 'トークンが見つかりません。'}
                                    </span>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary ms-2"
                                        onClick={() => setIsTokenVisible(!isTokenVisible)}
                                        disabled={!apiToken}
                                    >
                                        {isTokenVisible ? '非表示' : '表示する'}
                                    </button>
                                </p>
                                <button
                                    type="button"
                                    className="btn btn-warning btn-sm mb-3"
                                    onClick={handleRegenerateToken}
                                    disabled={regenerating}
                                >
                                    {regenerating ? '再生成中...' : 'トークンを発行/再生成'}
                                </button>

                                <hr />

                                <form onSubmit={handlePolicySubmit}>
                                    <div className="form-check mb-3">
                                        <input
                                            type="checkbox"
                                            id="policy_is_active"
                                            className="form-check-input"
                                            checked={tokenPolicy.is_active}
                                            onChange={(e) => setTokenPolicy(prev => ({ ...prev, is_active: e.target.checked }))}
                                        />
                                        <label className="form-check-label" htmlFor="policy_is_active">
                                            このトークンを有効にする
                                        </label>
                                    </div>

                                    <div className="mb-3">
                                        <label htmlFor="policy_allowed_ips" className="form-label">接続許可IPアドレス</label>
                                        <textarea
                                            id="policy_allowed_ips"
                                            className="form-control"
                                            rows={3}
                                            placeholder="例: 203.0.113.10&#10;198.51.100.0/24"
                                            value={tokenPolicy.allowed_ips}
                                            onChange={(e) => setTokenPolicy(prev => ({ ...prev, allowed_ips: e.target.value }))}
                                        />
                                        <div className="form-text">1行または1カンマ区切りにつき1つ、IPアドレスまたはCIDR表記。空欄の場合は制限しません。</div>
                                    </div>

                                    <div className="mb-3">
                                        <label className="form-label d-block">アクセス許可API（スコープ）</label>
                                        {API_SCOPE_CHOICES.map(([key, label]) => (
                                            <div className="form-check form-check-inline" key={key}>
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    id={`scope_${key}`}
                                                    checked={tokenPolicy.scopes.includes(key)}
                                                    onChange={() => handleScopeToggle(key)}
                                                />
                                                <label className="form-check-label" htmlFor={`scope_${key}`}>{label}</label>
                                            </div>
                                        ))}
                                        <div className="form-text">未選択（すべて外す）の場合は全アプリにアクセス可能です。</div>
                                    </div>

                                    <button type="submit" className="btn btn-primary btn-sm" disabled={policySubmitting}>
                                        {policySubmitting ? '保存中...' : 'アクセス制御ポリシーを保存'}
                                    </button>
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
