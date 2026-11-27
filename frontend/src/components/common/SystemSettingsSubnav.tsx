import { NavLink } from 'react-router-dom';

/** CSV・表示設定・QRコードアクションの設定画面に共通のサブナビゲーション(現在の画面を強調する) */
const LINKS = [
    { to: '/system/csv-mappings', label: '① CSVマッピング設定' },
    { to: '/system/model-display-settings', label: '② モデル項目表示設定' },
    { to: '/system/page-display-settings', label: '③ ページ項目表示設定' },
    { to: '/system/qr-code-actions', label: '④ QRコードアクション設定' },
];

const SystemSettingsSubnav = () => (
    <div className="system-subnav-bar">
        <NavLink to="/system/settings" end className="system-subnav-link">← システム設定一覧</NavLink>
        {LINKS.map(link => (
            <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `system-subnav-link${isActive ? ' active' : ''}`}
            >
                {link.label}
            </NavLink>
        ))}
    </div>
);

export default SystemSettingsSubnav;
