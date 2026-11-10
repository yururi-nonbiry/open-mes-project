import React from 'react';
import { Link } from 'react-router-dom';
import { NavIcon, NavIconName } from '../config/navigationConfig';

interface SettingMenuItem {
  path: string;
  title: string;
  tag: string;
  description: string;
  icon: NavIconName;
}

const SETTING_ITEMS: SettingMenuItem[] = [
  {
    path: '/system/feature-settings',
    title: '有効機能設定',
    tag: '業務フロー表示',
    description: '生産ナビ 全体業務フロー（フロー①〜③）の表示・グレーアウト・非表示を設定します。',
    icon: 'settings',
  },
  {
    path: '/system/csv-mappings',
    title: 'CSVマッピング設定',
    tag: 'CSV取込ルール',
    description: 'CSV一括取込時の列名・フィールド対応や初期値を設定します。',
    icon: 'upload',
  },
  {
    path: '/system/model-display-settings',
    title: 'モデル項目表示設定',
    tag: 'データ項目設定',
    description: '入庫・在庫・計画などの各データモデルで表示・検索する項目を設定します。',
    icon: 'settings',
  },
  {
    path: '/system/page-display-settings',
    title: 'ページ項目表示設定',
    tag: '画面列設定',
    description: '各業務画面の一覧テーブルに表示する列や並び順を設定します。',
    icon: 'inquiry',
  },
  {
    path: '/system/qr-code-actions',
    title: 'QRコードアクション設定',
    tag: 'QR読取動作',
    description: 'QRコードを読み取った際の検索・画面遷移ルールを設定します。',
    icon: 'qr-action',
  },
];

const SystemSettings = () => {
  return (
    <div className="goods-receipt-page">
      <div className="system-settings-grid">
        {SETTING_ITEMS.map((item, idx) => (
          <Link key={item.path} to={item.path} className="system-setting-card">
            <div className="step-card-header">
              <div className="step-card-badges">
                <span className="step-number-badge">
                  {['①', '②', '③', '④'][idx] || `(${idx + 1})`}
                </span>
                <span className="step-tag-label">{item.tag}</span>
              </div>
              <span className="step-card-chevron" aria-hidden="true">
                ›
              </span>
            </div>
            <div className="step-card-main">
              <span className="step-card-icon">
                <NavIcon name={item.icon} size={19} />
              </span>
              <span className="step-card-title">{item.title}</span>
            </div>
            <span className="step-card-desc">{item.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default SystemSettings;