import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import authFetch, { handleError, toApiError } from '../utils/api';
import { useAuth } from '../hooks/useAuth';

interface User {
    id: number;
    custom_id: string;
    username?: string;
    email?: string;
    account_type: string;
    is_staff: boolean;
    is_active: boolean;
    is_superuser: boolean;
    date_joined: string;
}

interface PageMessage {
    text: string;
    type: string;
}

const UserManagement = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<PageMessage>({ text: '', type: '' });
    const location = useLocation();
    const navigate = useNavigate();
    // スーパーユーザーのアカウントを変更・削除できるのはスーパーユーザーのみ(サーバー側でも拒否される)
    const { isSuperuser } = useAuth();

    // Display messages passed via router state (e.g., after a redirect from create/edit)
    useEffect(() => {
        if (location.state?.message) {
            setMessage({ text: location.state.message, type: location.state.messageType || 'success' });
            // Clear the state to prevent message from re-appearing on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate]);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setMessage({ text: '', type: '' });
        try {
            // NOTE: This assumes a JSON-based API endpoint at /api/users/
            // This needs to be created in the Django backend.
            const response = await authFetch('/api/users/');
            await handleError(response, `HTTP error! status: ${response.status}`);
            const data = await response.json();
            setUsers(data.results || data); // Support paginated or simple list response
        } catch (e) {
            setMessage({ text: `ユーザーデータの読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`, type: 'danger' });
            console.error("Fetch error:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleDelete = async (userId: number, userCustomId: string) => {
        if (window.confirm(`本当にユーザー "${userCustomId}" を削除しますか？この操作は元に戻せません。`)) {
            setMessage({ text: '', type: '' });
            try {
                // NOTE: This assumes a DELETE endpoint at /api/users/<id>/
                const response = await authFetch(`/api/users/${userId}/`, {
                    method: 'DELETE',
                });

                if (response.ok) {
                    setMessage({ text: `ユーザー "${userCustomId}" を削除しました。`, type: 'success' });
                    fetchUsers(); // Refresh the user list
                } else {
                    const error = await toApiError(response, '削除に失敗しました。');
                    setMessage({ text: error.message, type: 'danger' });
                }
            } catch (err) {
                console.error('Delete request failed:', err);
                setMessage({ text: 'ユーザーの削除中にエラーが発生しました。', type: 'danger' });
            }
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        // Format to 'YYYY-MM-DD HH:mm'
        return new Date(dateString).toISOString().slice(0, 16).replace('T', ' ');
    };

    return (
        <div className="goods-receipt-page">
            {message.text && (
                <div className={`alert alert-${message.type} alert-dismissible fade show shadow-sm`} role="alert">
                    {message.text}
                    <button type="button" className="btn-close" data-bs-dismiss="alert" aria-label="Close" onClick={() => setMessage({ text: '', type: '' })}></button>
                </div>
            )}

            <div className="goods-receipt-filter-panel mb-3">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
                    <div className="d-flex align-items-center gap-2">
                        <span className="receipt-filter-label mb-0">登録アカウント一覧</span>
                        <span className="badge rounded-pill bg-light text-secondary border px-2 py-1">
                            全 {users.length} 名
                        </span>
                    </div>
                    <div className="d-flex gap-2">
                        <button type="button" className="btn btn-outline-secondary btn-sm px-3 fw-bold" onClick={fetchUsers} disabled={loading}>
                            再読み込み
                        </button>
                        <Link to="/user/management/create" className="btn btn-primary btn-sm px-3 fw-bold shadow-sm">
                            ＋ 新規ユーザー作成
                        </Link>
                    </div>
                </div>
            </div>

            <div className="goods-receipt-table-card">
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0 goods-receipt-table">
                        <thead>
                            <tr>
                                <th>専用ID</th>
                                <th>ユーザー名</th>
                                <th>メールアドレス</th>
                                <th className="text-center">アカウント区分</th>
                                <th className="text-center">管理者・スタッフ権限</th>
                                <th className="text-center">有効状態</th>
                                <th>登録日時</th>
                                <th className="text-center" style={{ width: '160px' }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="text-center py-5 text-muted">読み込み中...</td></tr>
                            ) : users.length > 0 ? (
                                users.map(user => (
                                    <tr key={user.id}>
                                        <td className="fw-bold text-primary font-monospace">{user.custom_id}</td>
                                        <td className="fw-bold text-dark">{user.username || '-'}</td>
                                        <td className="text-secondary small">{user.email || '-'}</td>
                                        <td className="text-center">
                                            {user.account_type === 'system'
                                                ? <span className="receipt-status-badge status-in-progress">システム連携用</span>
                                                : <span className="badge bg-light text-secondary border">通常ユーザー</span>}
                                        </td>
                                        <td className="text-center">
                                            {user.is_staff
                                                ? <span className="status-mono-badge is-active">あり</span>
                                                : <span className="status-mono-badge is-inactive">なし</span>}
                                        </td>
                                        <td className="text-center">
                                            {user.is_active
                                                ? <span className="status-mono-badge is-active">有効</span>
                                                : <span className="receipt-status-badge status-cancelled">無効</span>}
                                        </td>
                                        <td className="text-secondary small">{formatDate(user.date_joined)}</td>
                                        <td className="text-center">
                                            {user.is_superuser && !isSuperuser ? (
                                                <span className="text-muted small">特権管理者のみ操作可</span>
                                            ) : (
                                                <div className="d-flex justify-content-center gap-1">
                                                    <Link to={`/user/management/edit/${user.id}`} className="btn btn-sm btn-outline-primary fw-bold">編集</Link>
                                                    <button onClick={() => handleDelete(user.id, user.custom_id)} className="btn btn-sm btn-outline-danger fw-bold">削除</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={8} className="text-center py-5 text-muted">該当するユーザーがいません。</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default UserManagement;