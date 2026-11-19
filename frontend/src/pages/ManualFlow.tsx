import React from 'react';
import { Link } from 'react-router-dom';
import styles from './UsagePage.module.css';
import { registerTermTarget } from '../utils/terms';

interface FlowStep {
  label: string;
  hint: string;
  /** クリックで開く実際の画面 */
  path: string;
  /** 使い方ガイド内の説明(セクションID) */
  sectionId: string;
}

interface FlowLane {
  id: string;
  title: string;
  color: string;
  steps: FlowStep[];
}

// 文言は既定の呼び方(部品・ピッキング・出庫)で書く。表示時に管理者設定へ置き換わる
const LANES: FlowLane[] = [
  {
    id: 'receipt',
    title: '① 部品を仕入れて、在庫にする',
    color: '#0284c7',
    steps: [
      { label: '発注データ取込', hint: '発注を登録', path: '/data/import', sectionId: 'data-import' },
      { label: '入庫', hint: '届いた部品を受け入れ', path: '/inventory/purchase', sectionId: 'goods-receipt' },
      { label: '在庫照会', hint: '棚ごとの在庫を確認', path: '/inventory/inquiry', sectionId: 'inventory-inquiry' },
    ],
  },
  {
    id: 'issue',
    title: '② 在庫から出す',
    color: '#d97706',
    steps: [
      { label: '出庫予定', hint: '出す予定の一覧', path: '/inventory/shipment', sectionId: 'shipment-schedule' },
      { label: '出庫', hint: '在庫から払い出す', path: '/inventory/issue', sectionId: 'goods-issue' },
      { label: '入出庫履歴', hint: '動きを後から確認', path: '/inventory/stock-movement-history', sectionId: 'stock-movement-history' },
    ],
  },
  {
    id: 'production',
    title: '③ 生産に使う（在庫の部品を使う流れ）',
    color: '#4338ca',
    steps: [
      { label: 'BOM', hint: '必要な部品と数量', path: '/production/bom-master', sectionId: 'bom-master' },
      { label: '生産計画', hint: 'いつ何を作るか', path: '/production/plan', sectionId: 'production-plan' },
      { label: '部品引当', hint: '在庫の部品を確保', path: '/production/material-allocation', sectionId: 'material-allocation' },
      { label: 'ピッキング', hint: 'スマホで部品を集める', path: '/mobile/picking', sectionId: 'mobile' },
      { label: '作業進捗', hint: '作業の進み具合', path: '/production/work-progress', sectionId: 'work-progress' },
    ],
  },
];

registerTermTarget(LANES);

const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
  e.preventDefault();
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.pushState(null, '', `#${id}`);
  }
};

/** 業務の流れ図。各項目をクリックすると実際の画面へ移動し、「説明」で使い方ガイドの該当箇所へ移動する。 */
const ManualFlow: React.FC = () => (
  <div className={styles.flow} id="flow" role="region" aria-label="業務の流れ図">
    <h2 className={styles.flowTitle}>業務の流れ図</h2>
    <p className={styles.flowLead}>
      四角をクリックするとその画面を開きます。「説明」を押すとこのガイドの手順へ移動します。
      在庫は①で増え、②と③で使われます。
    </p>
    {LANES.map((lane) => (
      <div key={lane.id} className={styles.flowLane} style={{ '--lane-color': lane.color } as React.CSSProperties}>
        <h3 className={styles.flowLaneTitle}>{lane.title}</h3>
        <ol className={styles.flowSteps}>
          {lane.steps.map((step) => (
            <li key={step.path} className={styles.flowStep}>
              <Link to={step.path} className={styles.flowBox}>
                <span className={styles.flowLabel}>{step.label}</span>
                <span className={styles.flowHint}>{step.hint}</span>
              </Link>
              <a href={`#${step.sectionId}`} onClick={(e) => scrollToSection(e, step.sectionId)} className={styles.flowHelp}>
                説明
              </a>
            </li>
          ))}
        </ol>
      </div>
    ))}
  </div>
);

export default ManualFlow;
