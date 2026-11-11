import React, { useState, useEffect, useCallback } from 'react';
import authFetch, { ApiError, apiRequest, handleError } from '../utils/api';
import Modal from '../components/Modal';
import { useAuth } from '../hooks/useAuth';

type FieldErrors = Record<string, string[] | undefined>;

interface Message {
  id: number;
  text: string;
  type: string;
}

const UserSettings = () => {
  const { logout } = useAuth();
  // State for forms, data, and UI
  const [profileForm, setProfileForm] = useState({
    username: '',
    email: '',
    custom_id: '',
  });
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password1: '',
    new_password2: '',
  });
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [isTokenVisible, setIsTokenVisible] = useState(false);

  // State for UI feedback
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); // General error for page load
  const [messages, setMessages] = useState<Message[]>([]); // For success/error banners
  const [profileErrors, setProfileErrors] = useState<FieldErrors>({});
  const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({});

  // State for password modal
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Helper to add messages
  const addMessage = (text: string, type = 'info') => {
    const id = new Date().getTime();
    setMessages(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setMessages(prev => prev.filter(msg => msg.id !== id));
    }, 5000);
  };

  // Fetch initial data
  const fetchUserData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [profileRes, tokenRes] = await Promise.all([authFetch('/api/users/settings/'), authFetch('/api/users/settings/token/')]);

      await handleError(profileRes, 'ユーザーデータの読み込みに失敗しました。');
      const profileData = await profileRes.json();
      setProfileForm({
        username: profileData.username || '',
        email: profileData.email || '',
        custom_id: profileData.custom_id || '',
      });

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        setApiToken(tokenData.api_token || null);
      } else {
        console.warn("APIトークンの取得に失敗しました。");
        setApiToken(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      console.error("Fetch user data error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Form change handlers
  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfileForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordForm(prev => ({ ...prev, [name]: value }));
  };

  // Form submission handlers
  const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileErrors({});
    try {
      const data = await apiRequest('/api/users/settings/', {
        method: 'PATCH',
        body: JSON.stringify({
          username: profileForm.username,
          email: profileForm.email,
        }),
      }, 'プロフィールの更新に失敗しました。');
      addMessage(data.message || 'プロフィール情報が更新されました。', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setProfileErrors(err.errors as FieldErrors);
      }
      addMessage(err instanceof Error ? err.message : String(err), 'danger');
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordErrors({});
    try {
      const data = await apiRequest('/api/users/settings/password/', {
        method: 'POST',
        body: JSON.stringify(passwordForm),
      }, 'パスワードの変更に失敗しました。');
      closePasswordModal();
      // パスワード変更時はサーバー側で全てのセッション(リフレッシュトークン)が失効するため、再ログインを求める
      window.alert(`${data.message || 'パスワードが正常に変更されました。'}\n新しいパスワードで再度ログインしてください。`);
      logout();
    } catch (err) {
      // 項目別のエラーは各入力欄に、全体のメッセージはフォーム上部に表示する
      const fieldErrors = err instanceof ApiError && err.errors ? err.errors : {};
      setPasswordErrors({ ...(fieldErrors as FieldErrors), non_field_errors: [err instanceof Error ? err.message : String(err)] });
    }
  };

  const handleRegenerateToken = async () => {
    if (!window.confirm('トークンを再生成しますか？現在のトークンは無効になります。')) {
      return;
    }
    try {
      const data = await apiRequest('/api/users/settings/token/', { method: 'POST' }, 'トークンの再生成に失敗しました。');
      setApiToken(data.api_token);
      addMessage(data.message || 'APIトークンが再生成されました。', 'success');
      setIsTokenVisible(true); // Show the new token immediately
    } catch (err) {
      addMessage(err instanceof Error ? err.message : String(err), 'danger');
    }
  };

  // Modal controls
  const openPasswordModal = () => {
    setPasswordForm({ old_password: '', new_password1: '', new_password2: '' });
    setPasswordErrors({});
    setIsPasswordModalOpen(true);
  };

  const closePasswordModal = () => setIsPasswordModalOpen(false);

  // Render logic
  if (loading) {
    return <div className="goods-receipt-page text-center py-5 text-muted">読み込み中...</div>;
  }

  if (error) {
    return <div className="goods-receipt-page"><div className="alert alert-danger">{error}</div></div>;
  }

  const renderMessages = () => {
    return messages.map(msg => (
      <div key={msg.id} className={`alert alert-${msg.type} alert-dismissible fade show shadow-sm`} role="alert">
        {msg.text}
        <button type="button" className="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    ));
  };

  return (
    <div className="goods-receipt-page" style={{ maxWidth: '820px' }}>
      {renderMessages()}

      {/* Profile Edit Form */}
      <div className="goods-receipt-table-card p-4 mb-3">
        <h5 className="fw-bold text-dark mb-3 pb-2 border-bottom" style={{ fontSize: '0.98rem' }}>
          ① プロフィール情報の編集
        </h5>
        <div>
          <form onSubmit={handleProfileSubmit}>
            {profileErrors.non_field_errors && <div className="alert alert-danger">{profileErrors.non_field_errors.join(' ')}</div>}
            <div className="row mb-3 align-items-center">
              <label htmlFor="custom_id" className="col-sm-3 col-form-label fw-bold text-secondary small">専用ID</label>
              <div className="col-sm-9">
                <input type="text" id="custom_id" name="custom_id" className="form-control bg-light font-monospace" value={profileForm.custom_id} readOnly disabled />
                {profileErrors.custom_id && <div className="invalid-feedback">{profileErrors.custom_id.join(' ')}</div>}
              </div>
            </div>
            <div className="row mb-3 align-items-center">
              <label htmlFor="username" className="col-sm-3 col-form-label fw-bold text-secondary small">ユーザー名</label>
              <div className="col-sm-9">
                <input type="text" id="username" name="username" className={`form-control ${profileErrors.username ? 'is-invalid' : ''}`} value={profileForm.username} onChange={handleProfileChange} required />
                {profileErrors.username && <div className="invalid-feedback">{profileErrors.username.join(' ')}</div>}
              </div>
            </div>
            <div className="row mb-3 align-items-center">
              <label htmlFor="email" className="col-sm-3 col-form-label fw-bold text-secondary small">メールアドレス</label>
              <div className="col-sm-9">
                <input type="email" id="email" name="email" className={`form-control ${profileErrors.email ? 'is-invalid' : ''}`} value={profileForm.email} onChange={handleProfileChange} />
                {profileErrors.email && <div className="invalid-feedback">{profileErrors.email.join(' ')}</div>}
              </div>
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button type="submit" className="btn btn-primary px-4 fw-bold shadow-sm">プロフィール情報を保存</button>
            </div>
          </form>
        </div>
      </div>

      {/* Password Change */}
      <div className="goods-receipt-table-card p-4 mb-3 d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <h5 className="fw-bold text-dark mb-1" style={{ fontSize: '0.98rem' }}>
            ② パスワード変更
          </h5>
          <p className="text-secondary small mb-0">ログイン用パスワードを新しいものに変更します。</p>
        </div>
        <button type="button" className="btn btn-outline-primary px-3 fw-bold" onClick={openPasswordModal}>
          パスワードを変更する
        </button>
      </div>

      {/* API Token Management */}
      <div className="goods-receipt-table-card p-4">
        <h5 className="fw-bold text-dark mb-3 pb-2 border-bottom" style={{ fontSize: '0.98rem' }}>
          ③ APIトークン管理
        </h5>
        <div>
          <div className="p-3 bg-light rounded-3 border mb-2 d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div>
              <span className="small fw-bold text-secondary d-block mb-1">現在のトークン</span>
              <span id="apiTokenDisplay" style={{ wordBreak: 'break-all' }} className="font-monospace text-dark fw-semibold">
                {apiToken ? (isTokenVisible ? apiToken : '•'.repeat(40)) : 'トークンが見つかりません。'}
              </span>
            </div>
            <div className="d-flex gap-2">
              <button
                id="toggleTokenVisibility"
                type="button"
                className="btn btn-sm btn-outline-secondary fw-bold"
                onClick={() => setIsTokenVisible(!isTokenVisible)}
                disabled={!apiToken}
              >
                {isTokenVisible ? '非表示' : '表示する'}
              </button>
              <button
                type="button"
                name="regenerate_token"
                className="btn btn-sm btn-outline-warning fw-bold"
                onClick={handleRegenerateToken}
              >
                トークンを再生成
              </button>
            </div>
          </div>
          <p className="mb-0 text-secondary small">トークンを再生成すると、現在のトークンは無効になり、新しいトークンが作成されます。</p>
        </div>
      </div>

      {/* Password Change Modal */}
      <Modal isOpen={isPasswordModalOpen} onClose={closePasswordModal}>
        <form onSubmit={handlePasswordSubmit} noValidate>
          <div className="modal-header">
            <h5 className="modal-title">パスワード変更</h5>
            <button type="button" className="btn-close" onClick={closePasswordModal}></button>
          </div>
          <div className="modal-body">
            {passwordErrors.non_field_errors && <div className="alert alert-danger">{passwordErrors.non_field_errors.join(' ')}</div>}
            <div className="mb-3">
              <label htmlFor="old_password" className="form-label">現在のパスワード</label>
              <input type="password" id="old_password" name="old_password" className={`form-control ${passwordErrors.old_password ? 'is-invalid' : ''}`} value={passwordForm.old_password} onChange={handlePasswordChange} required />
              {passwordErrors.old_password && <div className="invalid-feedback">{passwordErrors.old_password.join(' ')}</div>}
            </div>
            <div className="mb-3">
              <label htmlFor="new_password1" className="form-label">新しいパスワード</label>
              <input type="password" id="new_password1" name="new_password1" className={`form-control ${passwordErrors.new_password1 ? 'is-invalid' : ''}`} value={passwordForm.new_password1} onChange={handlePasswordChange} required />
              {passwordErrors.new_password1 && <div className="invalid-feedback">{passwordErrors.new_password1.join(' ')}</div>}
            </div>
            <div className="mb-3">
              <label htmlFor="new_password2" className="form-label">新しいパスワード（確認）</label>
              <input type="password" id="new_password2" name="new_password2" className={`form-control ${passwordErrors.new_password2 ? 'is-invalid' : ''}`} value={passwordForm.new_password2} onChange={handlePasswordChange} required />
              {passwordErrors.new_password2 && <div className="invalid-feedback">{passwordErrors.new_password2.join(' ')}</div>}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={closePasswordModal}>キャンセル</button>
            <button type="submit" className="btn btn-primary">パスワードを保存</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UserSettings;