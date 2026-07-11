import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import authFetch from '../utils/api';

interface UserFormState {
    custom_id: string;
    username: string;
    email: string;
    password: string;
    is_staff: boolean;
    is_superuser: boolean;
    is_active: boolean;
}

const emptyForm: UserFormState = {
    custom_id: '',
    username: '',
    email: '',
    password: '',
    is_staff: false,
    is_superuser: false,
    is_active: true,
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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
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
        </div>
    );
};

export default UserForm;
