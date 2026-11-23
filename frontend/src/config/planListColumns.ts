/**
 * 生産計画一覧(/production/plan)の列定義。
 * 一覧の列は固定の項目一覧なので、表示/非表示・並び順・表示名だけを
 * モデル項目表示設定(data_type = production_plan)で変更できるようにする。
 * 選択チェックと操作ボタンの列は設定に関わらず常に表示する。
 */
export const PLAN_LIST_DATA_TYPE = 'production_plan';

export interface PlanListColumn {
    name: string;
    label: string;
    help: string;
    align?: 'end' | 'center';
}

export const PLAN_LIST_COLUMNS: PlanListColumn[] = [
    { name: 'plan_name', label: '計画名', help: '親計画・子計画・統合の情報も一緒に表示されます。' },
    { name: 'product_code', label: '製品コード（品番）', help: '生産する製品の品番です。' },
    { name: 'purpose', label: '用途', help: '使う在庫の用途です(空欄は汎用)。' },
    { name: 'planned_quantity', label: '計画数量', help: '生産する数量です。', align: 'end' },
    { name: 'planned_start_datetime', label: '開始予定日時', help: '', align: 'center' },
    { name: 'planned_end_datetime', label: '終了予定日時', help: '', align: 'center' },
    { name: 'status', label: '状態', help: '計画の進行状況です。', align: 'center' },
    { name: 'material_status', label: '部品の状況', help: '部品の引当状況です。' },
];
