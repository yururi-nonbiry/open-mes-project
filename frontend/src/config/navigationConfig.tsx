import React from 'react';

export type NavIconName =
  | 'home'
  | 'inventory'
  | 'production'
  | 'quality'
  | 'machine'
  | 'data'
  | 'admin'
  | 'account'
  | 'receipt'
  | 'inquiry'
  | 'shipment'
  | 'issue'
  | 'history'
  | 'bom'
  | 'plan'
  | 'simulation'
  | 'allocation'
  | 'progress'
  | 'master'
  | 'acceptance'
  | 'process-inspect'
  | 'start-inspect'
  | 'upload'
  | 'warehouse-map'
  | 'qr'
  | 'qr-action'
  | 'settings'
  | 'users'
  | 'security'
  | 'user-profile'
  | 'book'
  | 'info'
  | 'logout'
  | 'compass'
  | 'arrow-right'
  | 'check-circle'
  | 'x-circle'
  | 'supplier'
  | 'cost'
  | 'clipboard-check';

interface NavIconProps {
  name: NavIconName;
  size?: number;
  className?: string;
}

/**
 * 単色（モノクロ・currentColor継承）SVGアイコンコンポーネント
 */
export const NavIcon: React.FC<NavIconProps> = ({ name, size = 18, className = '' }) => {
  const commonProps = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: `nav-mono-icon ${className}`.trim(),
    'aria-hidden': true as const,
  };

  switch (name) {
    case 'home':
      return (
        <svg {...commonProps}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
          <path d="M9 21v-6h6v6" />
        </svg>
      );
    case 'inventory':
      return (
        <svg {...commonProps}>
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      );
    case 'production':
      return (
        <svg {...commonProps}>
          <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <path d="M17 18h1" />
          <path d="M12 18h1" />
          <path d="M7 18h1" />
        </svg>
      );
    case 'quality':
      return (
        <svg {...commonProps}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'machine':
      return (
        <svg {...commonProps}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case 'data':
      return (
        <svg {...commonProps}>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
        </svg>
      );
    case 'admin':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case 'account':
    case 'user-profile':
      return (
        <svg {...commonProps}>
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'receipt':
      return (
        <svg {...commonProps}>
          <path d="M12 3v12" />
          <path d="m8 11 4 4 4-4" />
          <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
        </svg>
      );
    case 'inquiry':
      return (
        <svg {...commonProps}>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
          <path d="M8 11h6" />
          <path d="M11 8v6" />
        </svg>
      );
    case 'shipment':
      return (
        <svg {...commonProps}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <path d="M8 14h.01" />
          <path d="M12 14h.01" />
          <path d="M16 14h.01" />
        </svg>
      );
    case 'issue':
      return (
        <svg {...commonProps}>
          <path d="M12 15V3" />
          <path d="m8 7 4-4 4 4" />
          <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
        </svg>
      );
    case 'history':
      return (
        <svg {...commonProps}>
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l4 2" />
        </svg>
      );
    case 'bom':
      return (
        <svg {...commonProps}>
          <rect x="9" y="2" width="6" height="5" rx="1" />
          <rect x="2" y="16" width="6" height="5" rx="1" />
          <rect x="16" y="16" width="6" height="5" rx="1" />
          <path d="M5 16v-4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v4" />
          <path d="M12 7v4" />
        </svg>
      );
    case 'plan':
      return (
        <svg {...commonProps}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>
      );
    case 'simulation':
      return (
        <svg {...commonProps}>
          <path d="M3 3v18h18" />
          <path d="m7 14 4-4 4 4 5-6" />
        </svg>
      );
    case 'allocation':
      return (
        <svg {...commonProps}>
          <path d="M16 16h6" />
          <path d="M19 13v6" />
          <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      );
    case 'progress':
      return (
        <svg {...commonProps}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'master':
      return (
        <svg {...commonProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      );
    case 'acceptance':
      return (
        <svg {...commonProps}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case 'process-inspect':
      return (
        <svg {...commonProps}>
          <path d="M6 18h8" />
          <path d="M3 22h18" />
          <path d="M14 22a7 7 0 1 0 0-14h-1" />
          <path d="M9 14h2" />
          <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
          <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
        </svg>
      );
    case 'start-inspect':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="10" />
          <polygon points="10 8 16 12 10 16 10 8" />
        </svg>
      );
    case 'upload':
      return (
        <svg {...commonProps}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      );
    case 'warehouse-map':
      return (
        <svg {...commonProps}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    case 'qr':
      return (
        <svg {...commonProps}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h-3z" />
          <path d="M18 18h3v3h-3z" />
          <path d="M18 14h3" />
          <path d="M14 18v3" />
        </svg>
      );
    case 'qr-action':
      return (
        <svg {...commonProps}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...commonProps}>
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      );
    case 'users':
      return (
        <svg {...commonProps}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'security':
      return (
        <svg {...commonProps}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case 'book':
      return (
        <svg {...commonProps}>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      );
    case 'info':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...commonProps}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      );
    case 'compass':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      );
    case 'arrow-right':
      return (
        <svg {...commonProps}>
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      );
    case 'check-circle':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'x-circle':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case 'supplier':
      return (
        <svg {...commonProps}>
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
          <path d="M9 22v-4h6v4" />
          <line x1="8" y1="6" x2="8.01" y2="6" />
          <line x1="16" y1="6" x2="16.01" y2="6" />
          <line x1="12" y1="6" x2="12.01" y2="6" />
          <line x1="12" y1="10" x2="12.01" y2="10" />
          <line x1="12" y1="14" x2="12.01" y2="14" />
          <line x1="16" y1="10" x2="16.01" y2="10" />
          <line x1="16" y1="14" x2="16.01" y2="14" />
          <line x1="8" y1="10" x2="8.01" y2="10" />
          <line x1="8" y1="14" x2="8.01" y2="14" />
        </svg>
      );
    case 'cost':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9 8l3 4 3-4" />
          <line x1="9" y1="12" x2="15" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
          <line x1="12" y1="12" x2="12" y2="18" />
        </svg>
      );
    case 'clipboard-check':
      return (
        <svg {...commonProps}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <polyline points="9 14 11 16 15 12" />
        </svg>
      );
  }
};

export const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

export function getCircledNumber(indexZeroBased: number): string {
  return CIRCLED_NUMBERS[indexZeroBased] || `(${indexZeroBased + 1})`;
}

export interface CategoryTheme {
  primary: string;      // メインカラー
  secondary: string;    // サブ/アクセントカラー
  bgLight: string;      // カード・セクションの淡い背景色
  bgSoft: string;       // ボタン・チップの背景色
  border: string;       // ボーダー色
  textDark: string;     // テキスト濃色
  badgeBg: string;      // バッジ背景色
}

export interface RelatedActionLink {
  label: string;
  subLabel?: string;
  path: string;
  highlight?: boolean;
}

export interface NavStepItem {
  path: string;
  matchPaths?: string[];
  label: string;
  pageTitle?: string;
  pageSubtitle?: string;
  guideSteps?: string[];
  step?: number;
  stepTag: string;
  description: string;
  manualHint?: string;
  nextActions?: RelatedActionLink[];
  icon: NavIconName;
  staffOnly?: boolean;
  mobileAppSupported?: boolean;
}

export interface NavCategory {
  id: 'inventory' | 'production' | 'quality' | 'machine' | 'data' | 'admin' | 'account';
  label: string;
  shortLabel: string;
  badgeLabel?: string;
  flowSummary: string;
  icon: NavIconName;
  staffOnly?: boolean;
  theme: CategoryTheme;
  items: NavStepItem[];
}

/**
 * 各管理メニューごとのカラーパレット（青ベース＋水色＋各カテゴリ識別カラー）と推奨作業順序定義
 */
export const NAV_CATEGORIES: NavCategory[] = [
  {
    id: 'inventory',
    label: '在庫管理',
    shortLabel: '在庫管理',
    badgeLabel: '手順 1〜5',
    flowSummary: '① 入庫処置　② 在庫照会　③ 出庫予定　④ 出庫処理　⑤ 入出庫履歴',
    icon: 'inventory',
    theme: {
      // 水色・シアンブルー系
      primary: '#0284c7',
      secondary: '#0ea5e9',
      bgLight: '#f0f9ff',
      bgSoft: '#e0f2fe',
      border: '#7dd3fc',
      textDark: '#075985',
      badgeBg: '#0284c7',
    },
    items: [
      {
        path: '/inventory/purchase',
        label: '入庫処置',
        pageTitle: '入庫処置（受入・入庫登録）',
        pageSubtitle:
          '入荷した部品・材料の予定一覧から「入庫処理」を押し、入庫数量・倉庫・棚番を確定して実在庫へ反映します。',
        guideSteps: [
          '未入庫の発注（入庫予定）を確認',
          '行右側の「入庫処理」ボタンを押す',
          '入庫数量・倉庫・棚番を確認して確定（在庫へ即時反映）',
        ],
        step: 1,
        stepTag: '入荷・入庫',
        description: '未入庫の発注品を倉庫・棚番へ入庫します',
        manualHint: 'PC画面のほか現場スマホアプリでも入庫処理を行えます',
        mobileAppSupported: true,
        nextActions: [
          { label: '在庫照会を見る', subLabel: '在庫数を確認', path: '/inventory/inquiry', highlight: true },
          { label: '入出庫履歴を見る', subLabel: '入庫記録を確認', path: '/inventory/stock-movement-history' },
        ],
        icon: 'receipt',
      },
      {
        path: '/inventory/inquiry',
        label: '在庫照会',
        pageTitle: '在庫照会（現在庫・棚番移動・数量修正）',
        pageSubtitle:
          '倉庫・棚番ごとの現在庫数・引当済数・利用可能数を確認し、必要に応じて棚番移動や数量修正を行います。',
        guideSteps: [
          '品番・倉庫・棚番で検索（在庫0も見る場合は「在庫有のみ」のチェックを外す）',
          '現在庫・引当済・利用可能数（現在庫−引当済）を確認',
          '棚を移す場合は「移動」、実地棚卸等で数を直す場合は「修正」を実行',
        ],
        step: 2,
        stepTag: '在庫確認・移動',
        description: '現在庫・引当数の確認や、棚番移動・数量修正を行います',
        manualHint: '在庫0も表示する場合は「在庫有」のチェックを外して検索します',
        nextActions: [
          { label: '入出庫履歴を見る', subLabel: '履歴を確認', path: '/inventory/stock-movement-history' },
          { label: '出庫処理へ進む', subLabel: '完成品を出庫', path: '/inventory/issue', highlight: true },
        ],
        icon: 'inquiry',
      },
      {
        path: '/inventory/shipment',
        label: '出庫予定',
        pageTitle: '出庫予定（受注・出荷スケジュール確認）',
        pageSubtitle:
          '出荷待ちの受注一覧から、出荷が必要な製品・予定数量・出庫予定日・出庫先を確認します。',
        guideSteps: [
          '未出庫の受注番号・品目・出庫予定日を確認',
          '製品在庫がまだ無い場合は「＋ 生産計画を作成」から製造を手配',
          '製品在庫が揃っている場合は「出庫処理へ進む」から出庫を実行',
        ],
        step: 3,
        stepTag: '受注・納期確認',
        description: '未出庫の受注リスト（必要数量・納期・出庫先）を確認します',
        manualHint: '製品在庫がまだ無い場合は、先に「生産計画」で製品を作ります',
        nextActions: [
          { label: '＋ 生産計画を作成', subLabel: 'データ投入画面へ', path: '/data/import?open=production_plan', highlight: true },
          { label: '出庫処理へ進む', subLabel: '在庫がある場合', path: '/inventory/issue' },
        ],
        icon: 'shipment',
      },
      {
        path: '/inventory/issue',
        label: '出庫処理',
        pageTitle: '出庫処理（完成品の出庫・ピッキング登録）',
        pageSubtitle:
          '出庫待ちの受注一覧から「出庫処理」を押し、今回出荷する数量を入力して実在庫から引き落とします。',
        guideSteps: [
          '出庫待ち一覧から対象の受注番号・品目・残数量を確認',
          '保管場所を見る場合は「地図で確認」、出庫する場合は「出庫処理」を押す',
          '出庫数量を入力して「出庫を確定する」を押す（複数回に分けての出庫も可能）',
        ],
        step: 4,
        stepTag: '製品出庫',
        description: '出庫予定に対して出庫数量を入力し、出庫を実行します',
        manualHint: '行の「出庫処理」→ 出庫数量を入力 →「出庫を確定する」（分けて出庫も可）',
        nextActions: [
          { label: '在庫照会を見る', subLabel: '残数を確認', path: '/inventory/inquiry' },
          { label: '入出庫履歴を見る', subLabel: '出庫履歴を確認', path: '/inventory/stock-movement-history', highlight: true },
        ],
        icon: 'issue',
      },
      {
        path: '/inventory/stock-movement-history',
        label: '入出庫履歴',
        pageTitle: '入出庫履歴（在庫変動ログの確認）',
        pageSubtitle:
          '入庫・生産使用・生産完了入庫・出庫・在庫調整のすべての在庫移動履歴を時系列で確認します。',
        guideSteps: [
          '移動タイプ（入庫・出庫・生産使用・生産完了入庫など）のボタンを選択',
          '品番・倉庫・日時範囲を入力して「検索」ボタンを押す',
          '移動日時・数量・記録者・参照ドキュメント（発注／受注／計画）を確認',
        ],
        step: 5,
        stepTag: '履歴確認',
        description: '入庫・生産使用・生産完了入庫・出庫の全履歴を確認します',
        manualHint: '移動タイプボタン（入庫・出庫など）を押して検索すると絞り込めます',
        nextActions: [
          { label: '在庫照会を見る', subLabel: '現在庫一覧', path: '/inventory/inquiry' },
        ],
        icon: 'history',
      },
    ],
  },
  {
    id: 'production',
    label: '生産管理',
    shortLabel: '生産管理',
    badgeLabel: '基本 1〜3 ＋ 補助2',
    flowSummary: '① 使用部品マスター　② 生産計画　③ 作業進捗　④ 順立て（材料引当）　⑤ 部品供給試算',
    icon: 'production',
    theme: {
      // ロイヤルブルー系
      primary: '#1d4ed8',
      secondary: '#2563eb',
      bgLight: '#eff6ff',
      bgSoft: '#dbeafe',
      border: '#93c5fd',
      textDark: '#1e3a8a',
      badgeBg: '#1d4ed8',
    },
    items: [
      {
        path: '/production/bom-master',
        label: '使用部品マスター',
        pageTitle: '使用部品マスター（BOM・部品構成の登録）',
        pageSubtitle:
          '製品・中間品1個を製造するのに必要な使用部品（材料・中間品）と所要数量を登録・管理します。',
        guideSteps: [
          '「新規登録」を押し、親品目（製品・中間品）と子品目（使用部品）を選択',
          '製品1個あたりの使用数量（所要数）を入力して保存',
          '多階層構成を確認したい場合は、行の「構成展開」で全階層の所要量を確認',
        ],
        step: 1,
        stepTag: '部品構成(BOM)',
        description: '完成品1個に必要な材料と所要数を登録・確認します',
        manualHint: '生産計画を作る前に、部品構成が登録されているか確認します',
        nextActions: [
          { label: '入庫処置へ', subLabel: '材料を入庫する', path: '/inventory/purchase' },
          { label: '＋ 生産計画を作成', subLabel: 'データ投入画面へ', path: '/data/import?open=production_plan', highlight: true },
        ],
        icon: 'bom',
      },
      {
        path: '/production/plan',
        label: '生産計画',
        pageTitle: '生産計画（部品構成の確認・順立て（材料引当））',
        pageSubtitle:
          '生産計画ごとに使用部品（所要数）を確認し、倉庫在庫からの「順立て（材料引当）」や中間品の手配を行います。',
        guideSteps: [
          '行の「部品構成」で使用部品と所要数を確認（計画ごとの変更も可）',
          '行の「順立て（材料引当）」を押し、倉庫と引当数量を確認して「引き当て実行」',
          '引当が完了したら「作業進捗」へ進み、製造完了登録を実施',
        ],
        step: 2,
        stepTag: '構成確認・順立て（材料引当）',
        description: '計画の「部品構成」確認と「順立て（材料引当）」を行います',
        manualHint: 'PC画面のほか現場スマホアプリでも順立て・ピッキングを行えます',
        mobileAppSupported: true,
        nextActions: [
          { label: '＋ 生産計画を作成', subLabel: 'データ投入画面へ', path: '/data/import?open=production_plan' },
          { label: '作業進捗へ進む', subLabel: '完了登録・完成品入庫', path: '/production/work-progress', highlight: true },
        ],
        icon: 'plan',
      },
      {
        path: '/production/work-progress',
        label: '作業進捗',
        pageTitle: '作業進捗（進捗更新・完了登録・完成品入庫）',
        pageSubtitle:
          '製造の開始・完了ステータスと良品数（OK）・不良数（NG）を登録し、完成品の自動入庫と引当材料の消費を反映します。',
        guideSteps: [
          '対象の生産計画を探し、行右側の「進捗・完了登録」ボタンを押す',
          'ステータスを「完了」に変更し、製作数量・NG数量を入力',
          '「進捗を登録」で確定（OK数分の完成品が自動入庫され、引当材料が消費されます）',
        ],
        step: 3,
        stepTag: '完了登録・自動入庫',
        description: 'ステータスを「完了」にして製作数・NG数を登録します',
        manualHint: '「進捗・完了登録」で完了にすると、OK数量分の完成品が自動入庫され引当材料が減ります',
        nextActions: [
          { label: '在庫照会で確認', subLabel: '完成品と材料残数', path: '/inventory/inquiry' },
          { label: '出庫処理へ進む', subLabel: '完成品を出庫', path: '/inventory/issue', highlight: true },
        ],
        icon: 'progress',
      },
      {
        path: '/production/material-allocation',
        label: '順立て（材料引当）',
        pageTitle: '順立て（材料引当）（引当一覧の確認・ピッキング・返却）',
        pageSubtitle:
          '生産計画に引き当てられた材料の一覧を確認し、ピッキングや未使用分の倉庫在庫への返却を行います。',
        guideSteps: [
          '生産計画や品番・ステータスで引当済みの材料を検索',
          '各計画に対する引当数量・ピッキング状況を確認',
          '未使用・余剰の材料がある場合は「返却」から倉庫在庫へ戻す',
        ],
        stepTag: '引当一覧・ピッキング',
        description: '引当済材料の一覧確認や、ピッキング・返却を行います',
        nextActions: [
          { label: '生産計画を見る', path: '/production/plan', highlight: true },
          { label: '在庫照会を見る', path: '/inventory/inquiry' },
        ],
        icon: 'allocation',
      },
      {
        path: '/production/parts-supply-simulation',
        label: '部品供給試算',
        pageTitle: '部品供給試算（所要量・過不足シミュレーション）',
        pageSubtitle:
          '生産計画の開始予定日時順に必要部品を展開し、現在庫・入庫予定と照合して過不足や手配期限を試算します。',
        guideSteps: [
          '生産計画に対する各部品の総所要量・現在庫・入庫予定を確認',
          'どの計画時点で部品が不足するか（過不足推移）を確認',
          '不足する部品のリードタイムに応じた発注・入庫手配を実施',
        ],
        stepTag: '過不足シミュレーション',
        description: '納期順の部品過不足や発注期限を試算します',
        nextActions: [
          { label: '入庫処置を見る', path: '/inventory/purchase', highlight: true },
          { label: '生産計画を見る', path: '/production/plan' },
        ],
        icon: 'simulation',
      },
    ],
  },
  {
    id: 'data',
    label: 'データメンテナンス',
    shortLabel: 'データ投入',
    badgeLabel: '登録・CSV一括',
    flowSummary: '① データ投入（生産計画作成・各種マスター登録・CSV一括取込）',
    icon: 'data',
    theme: {
      // インディゴブルー系
      primary: '#4f46e5',
      secondary: '#6366f1',
      bgLight: '#eef2ff',
      bgSoft: '#e0e7ff',
      border: '#a5b4fc',
      textDark: '#3730a3',
      badgeBg: '#4f46e5',
    },
    items: [
      {
        path: '/data/import',
        label: 'データ投入',
        pageTitle: 'データ投入（生産計画・マスター登録／CSV一括取込）',
        pageSubtitle:
          '生産計画の新規作成や、品番・倉庫・サプライヤーなどのマスターデータ管理、CSVファイルの一括登録を行います。',
        guideSteps: [
          '画面から登録する場合は、各カードの「新規作成」ボタンを押して入力・登録',
          '登録済みデータを確認・編集する場合は、各カードの「一覧表示」ボタンを押す',
          'CSVファイルでまとめて登録する場合は、下部の「CSVデータ一括登録」から取込',
        ],
        stepTag: '計画作成・マスタ・CSV',
        description: '生産計画の新規作成や、各種マスター・CSV一括登録を行います',
        manualHint: '生産計画を保存したら「生産計画」画面へ進み、順立て（材料引当）を行います',
        nextActions: [
          { label: '生産計画へ進む', subLabel: '部品構成・順立て（材料引当）', path: '/production/plan', highlight: true },
          { label: '入庫処置へ進む', subLabel: '材料を入庫する', path: '/inventory/purchase' },
        ],
        icon: 'upload',
      },
    ],
  },
  {
    id: 'quality',
    label: '品質管理',
    shortLabel: '品質管理',
    badgeLabel: '手順 1〜3',
    flowSummary: '① マスター作成　② 受入検査　③ 工程内検査',
    icon: 'quality',
    theme: {
      // ティール・エメラルド系
      primary: '#0d9488',
      secondary: '#14b8a6',
      bgLight: '#f0fdfa',
      bgSoft: '#ccfbf1',
      border: '#5eead4',
      textDark: '#115e59',
      badgeBg: '#0d9488',
    },
    items: [
      {
        path: '/quality/master-creation',
        label: 'マスター作成',
        pageTitle: '検査マスター作成（検査項目・合否基準の登録）',
        pageSubtitle:
          '受入検査や工程内検査で使用する検査対象・測定項目・規格値（合否基準）を登録・管理します。',
        guideSteps: [
          '検査対象の品目や検査種別（受入検査／工程内検査）を選択',
          '検査項目名・測定方法・合格基準（上限値／下限値など）を入力',
          '保存して「受入検査」「工程内検査」の記録画面へ反映',
        ],
        step: 1,
        stepTag: '検査規格登録',
        description: '検査項目と合否基準値を登録します',
        nextActions: [
          { label: '受入検査へ', path: '/quality/acceptance-inspection', highlight: true },
          { label: '工程内検査へ', path: '/quality/process-inspection' },
        ],
        icon: 'master',
      },
      {
        path: '/quality/acceptance-inspection',
        label: '受入検査',
        pageTitle: '受入検査（入荷材料・部品の品質検査記録）',
        pageSubtitle:
          '仕入先から入荷した材料・部品の受入検査を実施し、測定値と合否判定を記録します。',
        guideSteps: [
          '検査対象の入荷品目・ロットを選択して検査入力画面を開く',
          '検査項目ごとの測定値・チェック結果を入力',
          '合否判定を確認して検査結果を保存',
        ],
        step: 2,
        stepTag: '入荷品検査',
        description: '入荷した材料・部品の検査結果を記録します',
        nextActions: [
          { label: '入庫処置を見る', path: '/inventory/purchase', highlight: true },
          { label: '点検・検査履歴を見る', path: '/machine/inspection-history' },
        ],
        icon: 'acceptance',
      },
      {
        path: '/quality/process-inspection',
        label: '工程内検査',
        pageTitle: '工程内検査（製造中・完成前の品質検査記録）',
        pageSubtitle:
          '製造工程中の半製品・製品の測定値や外観検査結果を入力し、合否判定を記録します。',
        guideSteps: [
          '対象の生産計画・工程・品目を選択して検査を開始',
          '各検査項目の測定値・判定結果を入力',
          '検査結果を保存して品質記録へ反映',
        ],
        step: 3,
        stepTag: '製造中検査',
        description: '製造工程での測定値と合否判定を記録します',
        nextActions: [
          { label: '作業進捗を見る', path: '/production/work-progress', highlight: true },
          { label: '点検・検査履歴を見る', path: '/machine/inspection-history' },
        ],
        icon: 'process-inspect',
      },
    ],
  },
  {
    id: 'machine',
    label: '設備管理',
    shortLabel: '設備管理',
    badgeLabel: '手順 1〜3',
    flowSummary: '① マスター作成　② 始業点検　③ 点検履歴',
    icon: 'machine',
    theme: {
      // アンバー系
      primary: '#d97706',
      secondary: '#f59e0b',
      bgLight: '#fffbeb',
      bgSoft: '#fef3c7',
      border: '#fcd34d',
      textDark: '#92400e',
      badgeBg: '#d97706',
    },
    items: [
      {
        path: '/machine/master-creation',
        label: 'マスター作成',
        pageTitle: '設備マスター作成（製造設備・点検項目の登録）',
        pageSubtitle:
          '工場内の製造設備・ライン機器の基本情報（設備番号・名称・設置場所）を登録・管理します。',
        guideSteps: [
          '「新規登録」から設備番号・設備名・設置場所を入力',
          '登録済みの設備一覧から内容の確認・編集を実施',
          '登録した設備を使って毎日の「始業点検」を実施',
        ],
        step: 1,
        stepTag: '設備登録',
        description: '設備番号・設備名・設置場所を登録します',
        nextActions: [
          { label: '始業点検へ進む', path: '/machine/start-inspection', highlight: true },
        ],
        icon: 'master',
      },
      {
        path: '/machine/start-inspection',
        label: '始業点検',
        pageTitle: '始業点検（稼働前の日常設備点検登録）',
        pageSubtitle:
          '作業開始前に設備を選択し、日常点検項目のチェック結果と異常の有無を記録します。',
        guideSteps: [
          '点検対象の設備と点検担当者を選択',
          '各点検項目の結果（正常／異常・数値）を入力',
          '点検結果を保存して稼働前確認を完了',
        ],
        step: 2,
        stepTag: '稼働前点検',
        description: '設備を選択して毎日の稼働前点検を記録します',
        nextActions: [
          { label: '点検履歴を確認', path: '/machine/inspection-history', highlight: true },
        ],
        icon: 'start-inspect',
      },
      {
        path: '/machine/inspection-history',
        label: '点検履歴',
        pageTitle: '点検・検査履歴（実施記録の検索・詳細確認）',
        pageSubtitle:
          '過去に実施した設備の始業点検や品質検査の履歴・合否判定・記録者を検索して確認します。',
        guideSteps: [
          '対象設備・品目・実施日・判定結果で絞り込み検索',
          '一覧から確認したい点検・検査記録を選択',
          '詳細ボタンから項目ごとの測定値・合否を確認',
        ],
        step: 3,
        stepTag: '履歴確認',
        description: '設備点検・品質検査の実施履歴を確認します',
        icon: 'history',
      },
    ],
  },
  {
    id: 'admin',
    label: '管理者メニュー',
    shortLabel: '管理者設定',
    badgeLabel: '管理・設定 8項目',
    flowSummary: '① 倉庫レイアウト　② 在庫用途　③ 棚番QR作成　④ QRアクション　⑤ システム設定　⑥ ユーザー管理　⑦ セキュリティ　⑧ 有効機能設定',
    icon: 'admin',
    staffOnly: true,
    theme: {
      // スチールブルー系
      primary: '#0369a1',
      secondary: '#0284c7',
      bgLight: '#f0f9ff',
      bgSoft: '#e0f2fe',
      border: '#7dd3fc',
      textDark: '#0c4a6e',
      badgeBg: '#0369a1',
    },
    items: [
      {
        path: '/master/warehouse-layout',
        label: '倉庫レイアウト管理',
        pageTitle: '倉庫レイアウト管理（倉庫内棚番マップの設計）',
        pageSubtitle:
          '倉庫ごとのグリッド（行・列）上に棚番（ロケーション）を配置し、保管場所マップを作成します。',
        guideSteps: [
          '対象の倉庫を選択し、マップの行数・列数を設定',
          'グリッド上で棚番コード・名称・サイズを配置',
          '保存して出庫処置の「地図で確認」マップ等に反映',
        ],
        stepTag: '倉庫マップ設計',
        description: '倉庫内の棚番配置をマップ上で設計します',
        icon: 'warehouse-map',
        staffOnly: true,
      },
      {
        path: '/master/stock-purposes',
        label: '在庫用途管理',
        pageTitle: '在庫用途管理（部品の用途区分マスタ）',
        pageSubtitle:
          '同じ品番の在庫を「何用の部品か」で区別して持つための用途（例: A製品用・保守用）を登録・管理します。',
        guideSteps: [
          '用途コードと用途名を入力して登録',
          '入庫時に用途を選ぶと、用途ごとに別在庫として計上',
          '使わなくなった用途は削除せず無効に切り替え',
        ],
        stepTag: '用途マスタ',
        description: '在庫の用途区分（A製品用・保守用など）を管理します',
        icon: 'master',
        staffOnly: true,
      },
      {
        path: '/system/shelf-qr-code',
        label: '倉庫棚番QR作成',
        pageTitle: '倉庫棚番QR作成（ロケーションQRコードの発行）',
        pageSubtitle:
          '倉庫番号・棚番ごとのQRコード一覧とラベル画像を生成し、現物棚への掲示やモバイル読取に利用します。',
        guideSteps: [
          '倉庫番号と棚番を入力して登録、またはCSVから一括登録',
          '一覧からQRコードを確認したい棚番を選択',
          'QRコード画像を表示・ダウンロードして棚ラベルに利用',
        ],
        stepTag: '棚番QR発行',
        description: '倉庫・棚番のQRコード一覧と画像を生成します',
        icon: 'qr',
        staffOnly: true,
      },
      {
        path: '/system/qr-code-actions',
        label: 'QRコードアクション設定',
        pageTitle: 'QRコードアクション設定（読取時の動作ルール管理）',
        pageSubtitle:
          'QRコードを読み取った際に自動実行する処理や遷移先ルールを登録・管理します。',
        guideSteps: [
          '「新規作成」からアクション名と対象QRパターンを設定',
          '読取時に実行するスクリプト・動作内容を入力',
          '有効／無効を切り替えて保存',
        ],
        stepTag: 'QR読取ルール',
        description: 'QRコード読取時の動作ルールを設定します',
        icon: 'qr-action',
        staffOnly: true,
      },
      {
        path: '/system/settings',
        matchPaths: [
          '/system/settings',
          '/system/csv-mappings',
          '/system/model-display-settings',
          '/system/page-display-settings',
        ],
        label: 'システム設定',
        pageTitle: 'システム設定（CSVマッピング・画面表示項目の管理）',
        pageSubtitle:
          'CSV取込時の列マッピングや、各一覧画面・検索欄に表示する項目・並び順をカスタマイズします。',
        guideSteps: [
          '設定したいメニュー（CSVマッピング／モデル項目表示／ページ表示設定）を選択',
          '対象のデータ種別（入庫予定・在庫・生産計画など）を選ぶ',
          '表示名・表示順・検索対象フラグを変更して保存',
        ],
        stepTag: '表示・CSV設定',
        description: 'CSVマッピングや一覧・画面の表示項目を設定します',
        icon: 'settings',
        staffOnly: true,
      },
      {
        path: '/user/management',
        matchPaths: ['/user/management', '/user/management/create', '/user/management/edit'],
        label: 'ユーザー管理',
        pageTitle: 'ユーザー管理（アカウント・権限・APIトークン管理）',
        pageSubtitle:
          'システムを利用するユーザーの追加・編集、管理者権限の付与、外部連携トークンの管理を行います。',
        guideSteps: [
          '新しくユーザーを追加する場合は「新規ユーザー作成」を押す',
          '専用ID・ユーザー名・メールアドレス・権限（スタッフ／スーパーユーザー）を設定',
          '既存ユーザーの編集・削除は一覧右側の操作ボタンから実行',
        ],
        stepTag: '権限・トークン',
        description: 'ユーザーアカウント・権限・連携トークンを管理します',
        icon: 'users',
        staffOnly: true,
      },
      {
        path: '/system/security',
        label: 'セキュリティ',
        pageTitle: 'セキュリティ管理（アカウントロック解除・監査ログ）',
        pageSubtitle:
          'ログイン失敗によるアカウントロックの確認・解除や、アクセス試行履歴の監査を行います。',
        guideSteps: [
          'ロック中アカウント一覧やアクセス試行履歴を確認',
          'ロック解除が必要なアカウントを選択して解除を実行',
          '不審なログイン試行がないか監査ログを確認',
        ],
        stepTag: 'ロック解除・監査',
        description: 'アカウントロック解除やアクセスログを確認します',
        icon: 'security',
        staffOnly: true,
      },
      {
        path: '/system/feature-settings',
        label: '有効機能設定',
        pageTitle: '有効機能設定（全体業務フローの表示切替）',
        pageSubtitle:
          '生産ナビの全体業務フロー（フロー①〜③）の表示状態（表示・グレーアウト・非表示）を設定します。',
        guideSteps: [
          '対象のフロー（フロー①〜③）を選択',
          '「表示」「グレーアウト」「非表示」から希望の状態を選択',
          '「設定を保存」を押してトップページに即時反映',
        ],
        stepTag: 'フロー有効化',
        description: '全体業務フロー（フロー①〜③）の表示・グレーアウト・非表示を設定します',
        icon: 'settings',
        staffOnly: true,
      },
    ],
  },
  {
    id: 'account',
    label: 'アカウント',
    shortLabel: 'アカウント',
    badgeLabel: 'ガイド・個人設定',
    flowSummary: '① 使い方　② ユーザー設定',
    icon: 'account',
    theme: {
      primary: '#0284c7',
      secondary: '#38bdf8',
      bgLight: '#f0f9ff',
      bgSoft: '#e0f2fe',
      border: '#bae6fd',
      textDark: '#075985',
      badgeBg: '#0284c7',
    },
    items: [
      {
        path: '/usage',
        label: '使い方',
        pageTitle: '使い方ガイド（画面キャプチャ付き操作マニュアル）',
        pageSubtitle:
          'データ投入から入庫・生産・出庫までの各画面の操作手順を画面キャプチャ付きで確認できます。',
        guideSteps: [
          '上部の目次・カテゴリから確認したい業務を選択',
          '画面キャプチャと番号付き解説に沿って操作手順を確認',
          '各セクションのリンクから実際の業務画面へ移動して操作',
        ],
        stepTag: 'マニュアル',
        description: '画面キャプチャ付きの操作手順書を確認します',
        icon: 'book',
      },
      {
        path: '/user/settings',
        label: 'ユーザー設定',
        pageTitle: 'ユーザー設定（プロフィール・パスワード・APIトークン）',
        pageSubtitle:
          'ログイン中のアカウント情報の確認、パスワード変更、個人用APIトークンの発行・再生成を行います。',
        guideSteps: [
          '登録されている専用ID・氏名・メールアドレスを確認・更新',
          'パスワードを変更する場合は現在のパスワードと新パスワードを入力',
          '外部連携用のAPIトークンの確認・再生成を実施',
        ],
        stepTag: 'プロフィール',
        description: 'パスワード変更や個人APIトークンを管理します',
        icon: 'user-profile',
      },
    ],
  },
];

export interface FlowQuickLink {
  label: string;
  path: string;
  primary?: boolean;
}

export interface DataInputMethodGuide {
  withExternalApp: string;
  externalLinks?: FlowQuickLink[];
  withoutExternalApp: string;
  standaloneLinks?: FlowQuickLink[];
}

export interface OverallWorkflowPhase {
  step: number;
  title: string;
  categoryLabel: string;
  scenarioBadge?: string;
  color: string;
  bgLight: string;
  border: string;
  icon: NavIconName;
  summary: string;
  dataInputGuide?: DataInputMethodGuide;
  links: FlowQuickLink[];
  mobileAppSupported?: boolean;
  mobileAppLabel?: string;
  mobileAppNote?: string;
}

export interface GuidedStepDefinition {
  stepIndex: number;
  title: string;
  shortTitle: string;
  path: string;
  actionSteps: string[];
  subButtons?: FlowQuickLink[];
  nextButtonLabel: string;
  mobileHint?: string;
}

export interface WorkflowTrack {
  id: 'receipt-flow' | 'production-plan-flow' | 'production-issue-flow';
  badge: string;
  title: string;
  subtitle: string;
  accentColor: string;
  bgGradient: string;
  borderColor: string;
  icon: NavIconName;
  startExternalPath: string;
  startStandalonePath: string;
  phases: OverallWorkflowPhase[];
  guidedSteps: GuidedStepDefinition[];
}

/**
 * トップページ上部に表示する3大業務フロー ＆ 遷移先画面でボタンを押していくだけで完了するステップナビ定義
 * 1. データ投入から入庫まで (receipt-flow)
 * 2. 生産計画からピッキングまで (production-plan-flow)
 * 3. 生産から出庫まで (production-issue-flow)
 */
export const WORKFLOW_TRACKS: WorkflowTrack[] = [
  {
    id: 'receipt-flow',
    badge: 'フロー ①',
    title: 'データ投入から入庫まで',
    subtitle: '支給品・材料を倉庫へ入庫し、在庫を確認する流れ',
    accentColor: '#0284c7',
    bgGradient: '#f8fafc',
    borderColor: '#bae6fd',
    icon: 'receipt',
    startExternalPath: '/inventory/purchase?flow=receipt-flow&mode=external&fstep=2',
    startStandalonePath: '/data/import?flow=receipt-flow&mode=standalone&fstep=1',
    phases: [
      {
        step: 1,
        title: 'データ投入',
        categoryLabel: 'データ準備',
        scenarioBadge: '入庫予定の準備',
        color: '#4f46e5',
        bgLight: '#f5f3ff',
        border: '#c7d2fe',
        icon: 'upload',
        summary: '入庫予定データを用意します',
        dataInputGuide: {
          withExternalApp: '他アプリでCSV取込 → 同期',
          externalLinks: [
            {
              label: '同期済 → ② 入庫処置へ',
              path: '/inventory/purchase?flow=receipt-flow&mode=external&fstep=2',
            },
          ],
          withoutExternalApp: '「データ投入」で倉庫・品番・仕入先を登録',
          standaloneLinks: [
            {
              label: 'データ投入を開く',
              path: '/data/import?flow=receipt-flow&mode=standalone&fstep=1',
              primary: true,
            },
          ],
        },
        links: [],
      },
      {
        step: 2,
        title: '入庫処置',
        categoryLabel: '在庫管理',
        scenarioBadge: '入庫の実行',
        color: '#0284c7',
        bgLight: '#f0f9ff',
        border: '#bae6fd',
        icon: 'receipt',
        summary: '未入庫の発注を確認し、行右側の「入庫処理」から数量・倉庫・棚番を確定して入庫',
        mobileAppSupported: true,
        mobileAppLabel: 'スマホアプリ対応',
        mobileAppNote: '現場スマホ端末のバーコード読取でも入庫処理を行えます',
        links: [
          { label: '② 入庫処置を開く', path: '/inventory/purchase?flow=receipt-flow&fstep=2' },
        ],
      },
      {
        step: 3,
        title: '在庫照会',
        categoryLabel: '在庫管理',
        scenarioBadge: '在庫数の確認',
        color: '#0369a1',
        bgLight: '#f0f9ff',
        border: '#bae6fd',
        icon: 'inquiry',
        summary: '入庫した品番の在庫数が増えているか確認して完了',
        links: [
          { label: '③ 在庫照会を開く', path: '/inventory/inquiry?flow=receipt-flow&fstep=3' },
        ],
      },
    ],
    guidedSteps: [
      {
        stepIndex: 1,
        title: 'データ投入（マスター登録）',
        shortTitle: '1. データ投入',
        path: '/data/import',
        actionSteps: [
          '① 倉庫マスターの「新規作成」を押す',
          '② 品番マスターの「新規作成」を押す',
          '③ サプライヤーマスターの「新規作成」を押す',
        ],
        subButtons: [
          { label: '① 倉庫マスターを新規作成', path: '/data/import?flow=receipt-flow&fstep=1&open=warehouse' },
          { label: '② 品番マスターを新規作成', path: '/data/import?flow=receipt-flow&fstep=1&open=item' },
          { label: '③ 仕入先（サプライヤー）を新規作成', path: '/data/import?flow=receipt-flow&fstep=1&open=supplier' },
        ],
        nextButtonLabel: '次へ：2. 入庫処置を開く →',
      },
      {
        stepIndex: 2,
        title: '入庫処置（入庫の実行）',
        shortTitle: '2. 入庫処置',
        path: '/inventory/purchase',
        mobileHint: '現場スマホ端末でもバーコード読取による入庫処理に対応',
        actionSteps: [
          '① 未入庫の発注（入庫予定）を確認',
          '② 行右側の「入庫処理」を押す',
          '③ 数量・倉庫・棚番を確認して「入庫を確定する」',
        ],
        nextButtonLabel: '次へ：3. 在庫照会で確認 →',
      },
      {
        stepIndex: 3,
        title: '在庫照会（在庫数の確認・完了）',
        shortTitle: '3. 在庫照会',
        path: '/inventory/inquiry',
        actionSteps: [
          '① 品番・倉庫で絞り込み「検索」を押す',
          '② 入庫した数量が「現在庫数」に反映されているか確認して完了',
        ],
        nextButtonLabel: '✓ 完了（トップへ戻る）',
      },
    ],
  },
  {
    id: 'production-plan-flow',
    badge: 'フロー ②',
    title: '生産計画からピッキングまで',
    subtitle: 'マスタ登録・部品構成・出庫予定確認から順立て（ピッキング）までの流れ',
    accentColor: '#2563eb',
    bgGradient: '#f8fafc',
    borderColor: '#bfdbfe',
    icon: 'plan',
    startExternalPath: '/production/bom-master?flow=production-plan-flow&mode=external&fstep=2',
    startStandalonePath: '/data/import?flow=production-plan-flow&mode=standalone&fstep=1',
    phases: [
      {
        step: 1,
        title: 'データ投入・部品構成',
        categoryLabel: '事前準備',
        scenarioBadge: '計画作成の前に実施',
        color: '#4f46e5',
        bgLight: '#f5f3ff',
        border: '#c7d2fe',
        icon: 'bom',
        summary: '完成品1個に必要な材料・所要数(BOM)を準備します',
        dataInputGuide: {
          withExternalApp: '他アプリで順立て・材料・出庫予定を同期',
          externalLinks: [
            {
              label: '同期済 → ① 使用部品マスターへ',
              path: '/production/bom-master?flow=production-plan-flow&mode=external&fstep=2',
            },
          ],
          withoutExternalApp: '「データ投入」で品目・倉庫登録 →「使用部品マスター」でBOM登録',
          standaloneLinks: [
            {
              label: '① データ投入を開く',
              path: '/data/import?flow=production-plan-flow&mode=standalone&fstep=1',
              primary: true,
            },
            {
              label: '② 使用部品マスター',
              path: '/production/bom-master?flow=production-plan-flow&mode=standalone&fstep=2',
            },
          ],
        },
        links: [],
      },
      {
        step: 2,
        title: '出庫予定確認',
        categoryLabel: '在庫管理',
        scenarioBadge: '必要数の確認',
        color: '#0284c7',
        bgLight: '#f0f9ff',
        border: '#bae6fd',
        icon: 'shipment',
        summary: '「出庫予定」で製品の必要数と出庫先を確認',
        links: [
          { label: '出庫予定を確認', path: '/inventory/shipment?flow=production-plan-flow&fstep=3' },
        ],
      },
      {
        step: 3,
        title: '順立て（材料引当・ピッキング）',
        categoryLabel: '生産管理',
        scenarioBadge: '計画と順立て',
        color: '#2563eb',
        bgLight: '#eff6ff',
        border: '#bfdbfe',
        icon: 'plan',
        summary: '計画一覧の「順立て（材料引当）」で材料を引き当て・ピッキング',
        mobileAppSupported: true,
        mobileAppLabel: 'スマホアプリ対応',
        mobileAppNote: '現場スマホ端末でも順立て（材料引当・ピッキング）を行えます',
        links: [
          { label: '生産計画(順立て)', path: '/production/plan?flow=production-plan-flow&fstep=4' },
        ],
      },
    ],
    guidedSteps: [
      {
        stepIndex: 1,
        title: 'データ投入（倉庫・品番マスター登録）',
        shortTitle: '1. マスタ登録',
        path: '/data/import',
        actionSteps: [
          '① 倉庫マスターの「新規作成」で倉庫を登録',
          '② 品番マスターの「新規作成」で完成品・材料を登録',
        ],
        subButtons: [
          { label: '① 倉庫マスターを新規作成', path: '/data/import?flow=production-plan-flow&fstep=1&open=warehouse' },
          { label: '② 品番マスターを新規作成', path: '/data/import?flow=production-plan-flow&fstep=1&open=item' },
        ],
        nextButtonLabel: '次へ：2. 使用部品マスターへ →',
      },
      {
        stepIndex: 2,
        title: '使用部品マスター（部品構成の確認・登録）',
        shortTitle: '2. 部品構成',
        path: '/production/bom-master',
        actionSteps: [
          '①「新規登録」から親品目と使用部品・所要数量を登録',
          '② 行の「構成展開」で多階層の構成と合計必要数を確認',
        ],
        nextButtonLabel: '次へ：3. 出庫予定を確認 →',
      },
      {
        stepIndex: 3,
        title: '出庫予定（作る数量と納期の確認）',
        shortTitle: '3. 出庫予定',
        path: '/inventory/shipment',
        actionSteps: [
          '① 製品の「出庫予定数量（合計）」を確認',
          '②「出庫予定日（納期）」と「出庫先」を確認',
        ],
        nextButtonLabel: '次へ：4. 生産計画（順立て（材料引当））へ →',
      },
      {
        stepIndex: 4,
        title: '生産計画（部品構成の確認と順立て（材料引当））',
        shortTitle: '4. 順立て（材料引当）',
        path: '/production/plan',
        mobileHint: '現場スマホ端末でも順立て・ピッキング作業に対応',
        actionSteps: [
          '① 計画行の「部品構成」で使用部品と所要数を確認',
          '② 計画行の「順立て（材料引当）」を押し、数量を確認して「引き当て実行」',
        ],
        nextButtonLabel: '✓ 完了（トップへ戻る）',
      },
    ],
  },
  {
    id: 'production-issue-flow',
    badge: 'フロー ③',
    title: '生産から出庫まで',
    subtitle: '作業完了（完成品自動入庫）から出荷処理・履歴確認までの流れ',
    accentColor: '#0d9488',
    bgGradient: '#f8fafc',
    borderColor: '#99f6e4',
    icon: 'production',
    startExternalPath: '/production/work-progress?flow=production-issue-flow&fstep=7',
    startStandalonePath: '/production/work-progress?flow=production-issue-flow&fstep=7',
    phases: [
      {
        step: 1,
        title: '作業完了（完成品入庫）',
        categoryLabel: '生産管理',
        scenarioBadge: '完成品が自動入庫',
        color: '#0d9488',
        bgLight: '#f0fdfa',
        border: '#99f6e4',
        icon: 'progress',
        summary: '「作業進捗」で行右側「進捗・完了登録」から完了と数量を登録（完成品が自動入庫）',
        links: [
          { label: '① 作業進捗(完了登録)', path: '/production/work-progress?flow=production-issue-flow&fstep=7' },
          { label: '② 在庫照会で確認', path: '/inventory/inquiry?flow=production-issue-flow&fstep=7' },
        ],
      },
      {
        step: 2,
        title: '出庫処理・履歴確認',
        categoryLabel: '在庫管理',
        scenarioBadge: '出庫と最終確認',
        color: '#b45309',
        bgLight: '#fffbeb',
        border: '#fde68a',
        icon: 'issue',
        summary: '「出庫処理」で行の「出庫処理」から出庫を確定し、「入出庫履歴」で結果を確認して完了',
        links: [
          { label: '① 出庫処理', path: '/inventory/issue?flow=production-issue-flow&fstep=8' },
          { label: '② 入出庫履歴', path: '/inventory/stock-movement-history?flow=production-issue-flow&fstep=9' },
        ],
      },
    ],
    guidedSteps: [
      {
        stepIndex: 7,
        title: '作業進捗（完了登録＝完成品の自動入庫）',
        shortTitle: '7. 作業完了',
        path: '/production/work-progress',
        actionSteps: [
          '① 計画行右側の「進捗・完了登録」を押す',
          '②「完了」を選び、製作数量・NG数量を入力して「進捗を登録」',
        ],
        subButtons: [
          { label: '在庫照会で完成品を確認', path: '/inventory/inquiry?flow=production-issue-flow&fstep=7' },
        ],
        nextButtonLabel: '次へ：8. 出庫処理へ →',
      },
      {
        stepIndex: 8,
        title: '出庫処理（完成品の出庫）',
        shortTitle: '8. 出庫処理',
        path: '/inventory/issue',
        actionSteps: [
          '① 棚番を確認したい場合は「地図で確認」を押す',
          '② 受注行の「出庫処理」を押す',
          '③ 出庫数量を確認して「出庫を確定する」を押す',
        ],
        nextButtonLabel: '次へ：9. 入出庫履歴で確認 →',
      },
      {
        stepIndex: 9,
        title: '入出庫履歴（最終確認・完了）',
        shortTitle: '9. 履歴確認',
        path: '/inventory/stock-movement-history',
        actionSteps: [
          '① 移動タイプボタン（入庫・生産使用・生産完了入庫・出庫）で絞り込み',
          '② 日時・数量・参照番号を確認して一連の流れが完了',
        ],
        subButtons: [
          { label: '在庫照会で残数を見る', path: '/inventory/inquiry?flow=production-issue-flow&fstep=9' },
        ],
        nextButtonLabel: '✓ 完了（トップへ戻る）',
      },
    ],
  },
];

export const OVERALL_WORKFLOW_PHASES: OverallWorkflowPhase[] =
  WORKFLOW_TRACKS[1].phases;

export interface ResolvedNavContext {
  isTopPage: boolean;
  category: NavCategory | null;
  item: NavStepItem | null;
  subPageLabel?: string;
}

const SUB_PAGE_LABELS: Record<string, string> = {
  '/system/feature-settings': '有効機能設定',
  '/system/csv-mappings': 'CSVマッピング設定',
  '/system/model-display-settings': 'モデル項目表示設定',
  '/system/page-display-settings': 'ページ項目表示設定',
  '/user/management/create': '新規ユーザー作成',
};

/**
 * 現在のURLパスから選択中の管理カテゴリと画面アイテムを特定する
 */
export function resolveCurrentNavigation(pathname: string): ResolvedNavContext {
  if (pathname === '/' || pathname === '') {
    return {
      isTopPage: true,
      category: null,
      item: null,
    };
  }

  for (const category of NAV_CATEGORIES) {
    for (const item of category.items) {
      if (item.path === pathname) {
        return { isTopPage: false, category, item };
      }
      if (item.matchPaths) {
        const matched = item.matchPaths.some(
          (mp) => pathname === mp || pathname.startsWith(`${mp}/`)
        );
        if (matched) {
          let subPageLabel = SUB_PAGE_LABELS[pathname];
          if (!subPageLabel && pathname.startsWith('/user/management/edit/')) {
            subPageLabel = 'ユーザー編集';
          }
          return { isTopPage: false, category, item, subPageLabel };
        }
      }
    }
  }

  return {
    isTopPage: false,
    category: null,
    item: null,
  };
}
