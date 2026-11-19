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

interface RelCard {
  name: string;
  desc: string;
  /** つながり(このデータが何と結びつくか) */
  links: string[];
  path?: string;
  sectionId?: string;
}

interface RelLayer {
  id: string;
  title: string;
  lead: string;
  color: string;
  cards: RelCard[];
}

const RELATIONS: RelLayer[] = [
  {
    id: 'master',
    title: 'マスタ（先に登録しておくもの）',
    lead: '他のデータから選んで使う、もとになる情報です。',
    color: '#7c3aed',
    cards: [
      { name: '品番', desc: '部品・製品の番号と名前。', links: ['発注・受注・在庫・BOM・生産計画のすべてで使う'], path: '/data/import', sectionId: 'data-import' },
      { name: '倉庫・棚番', desc: '物を置く場所。', links: ['在庫は倉庫・棚番ごとに持つ', '発注・受注・部品引当でも置き場所として使う'], sectionId: 'admin-system-warehouse' },
      { name: '仕入先', desc: '部品の購入先。', links: ['発注に結びつく'], path: '/data/import', sectionId: 'data-import' },
      { name: '在庫用途', desc: '在庫の使い道（通常・生産用など）の区分。', links: ['在庫・発注・入庫・受注に付けて区別する'], sectionId: 'admin-system-warehouse' },
    ],
  },
  {
    id: 'order',
    title: '予定と実績（発注・受注）',
    lead: '予定を登録し、入庫・出庫の実績で消し込みます。',
    color: '#0284c7',
    cards: [
      { name: '発注（入庫予定）', desc: '何をいくつ、いつ届くか。', links: ['品番・仕入先・倉庫を指定する', '入庫すると入庫済みの数が増える'], path: '/inventory/purchase', sectionId: 'goods-receipt' },
      { name: '入庫実績', desc: '実際に受け入れた記録。', links: ['発注に結びつく', '記録すると在庫が増える'], path: '/inventory/purchase', sectionId: 'goods-receipt' },
      { name: '受注（出庫予定）', desc: '何をいくつ、いつ出すか。', links: ['品番・倉庫を指定する', '出庫すると出庫済みの数が増える'], path: '/inventory/shipment', sectionId: 'shipment-schedule' },
    ],
  },
  {
    id: 'stock',
    title: '在庫',
    lead: '入庫・出庫・移動の結果が、ここに集まります。',
    color: '#059669',
    cards: [
      { name: '在庫', desc: '品番 × 倉庫 × 棚番 × 在庫用途ごとの数量。', links: ['入庫で増え、出庫で減る', '部品引当で生産用に確保される'], path: '/inventory/inquiry', sectionId: 'inventory-inquiry' },
      { name: '入出庫履歴', desc: '在庫が動くたびに自動で残る記録。', links: ['入庫・出庫・棚の移動が対象', '後から動きをさかのぼれる'], path: '/inventory/stock-movement-history', sectionId: 'stock-movement-history' },
    ],
  },
  {
    id: 'production',
    title: '生産',
    lead: '製品を作るために、在庫の部品を使います。',
    color: '#4338ca',
    cards: [
      { name: 'BOM（部品表）', desc: '製品1個に必要な部品と数量。', links: ['製品の品番と部品の品番を結びつける'], path: '/production/bom-master', sectionId: 'bom-master' },
      { name: '生産計画', desc: '製品をいつ・いくつ作るか。', links: ['BOMから必要な部品が決まる'], path: '/production/plan', sectionId: 'production-plan' },
      { name: '部品引当', desc: '計画に使う部品を在庫から確保する。', links: ['生産計画と在庫を結びつける', 'ピッキングで実際に集める'], path: '/production/material-allocation', sectionId: 'material-allocation' },
      { name: '作業進捗', desc: '計画ごとの作業の進み具合。', links: ['生産計画に結びつく'], path: '/production/work-progress', sectionId: 'work-progress' },
    ],
  },
];

registerTermTarget(LANES);
registerTermTarget(RELATIONS);

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

/** データの関連図。どのデータが何と結びついているかを、層ごとのカードで示す。 */
export const ManualRelations: React.FC = () => (
  <div className={styles.flow} id="relations" role="region" aria-label="データの関連図">
    <h2 className={styles.flowTitle}>データの関連図</h2>
    <p className={styles.flowLead}>
      上から下へ、先に登録するものから順に並べています。カードのタイトルを押すと、その画面を開きます。
    </p>
    {RELATIONS.map((layer, i) => (
      <React.Fragment key={layer.id}>
        {i > 0 && <div className={styles.relArrow} aria-hidden="true">↓</div>}
        <div className={styles.flowLane} style={{ '--lane-color': layer.color } as React.CSSProperties}>
          <h3 className={styles.flowLaneTitle}>{layer.title}<span className={styles.relLead}>{layer.lead}</span></h3>
          <ul className={styles.relCards}>
            {layer.cards.map((card) => (
              <li key={card.name} className={styles.relCard}>
                <div className={styles.relName}>
                  {card.path ? <Link to={card.path}>{card.name}</Link> : card.name}
                </div>
                <div className={styles.flowHint}>{card.desc}</div>
                <ul className={styles.relLinks}>
                  {card.links.map((l) => <li key={l}>{l}</li>)}
                </ul>
                {card.sectionId && (
                  <a href={`#${card.sectionId}`} onClick={(e) => scrollToSection(e, card.sectionId!)} className={styles.flowHelp}>
                    説明
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </React.Fragment>
    ))}
  </div>
);

export default ManualFlow;
