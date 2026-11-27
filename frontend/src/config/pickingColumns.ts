import { registerTermTarget } from '../utils/terms';
/**
 * 順立て・ピッキング画面の列定義(PC画面とモバイル画面)。
 * どちらもモデルの一覧ではないため、列はここで定義し、表示/非表示・並び順・表示名だけを
 * モデル項目表示設定(PC: picking_pc / モバイル: picking_mobile)で変更できるようにする。
 * ピッキング・返却・解除などの操作は設定に関わらず常に表示する。
 */
export const PICKING_PC_DATA_TYPE = 'picking_pc';
export const PICKING_MOBILE_DATA_TYPE = 'picking_mobile';

export interface PickingColumn {
    name: string;
    label: string;
    help: string;
    align?: 'end';
}

export const PICKING_PC_COLUMNS: PickingColumn[] = [
    { name: 'material', label: '部品コード・部品名', help: '部品の品番と名称です。' },
    { name: 'product_plan', label: '完成品（計画）', help: '「すべての完成品」を選んだときだけ表示されます。' },
    { name: 'line', label: '出庫先ライン', help: '未ピッキングの間は、ここでラインを変更できます。' },
    { name: 'purpose', label: '用途', help: '使う在庫の用途です(空欄は汎用)。' },
    { name: 'warehouse', label: '保管倉庫', help: '' },
    { name: 'allocated_quantity', label: '引当数量', help: '', align: 'end' },
    { name: 'allocation_datetime', label: '引当日時', help: '' },
    { name: 'status', label: '状態', help: '追加ピッキングの印も一緒に表示されます。' },
    { name: 'remarks', label: '備考', help: '' },
];
// 列名・説明の「部品」「ピッキング」「出庫」を、用語設定の呼び方に置き換える
registerTermTarget(PICKING_PC_COLUMNS);

export const PICKING_MOBILE_COLUMNS: PickingColumn[] = [
    { name: 'material_code', label: '部品コード', help: '追加ピッキングの印も一緒に表示されます。' },
    { name: 'material_name', label: '部品名', help: '' },
    { name: 'purpose', label: '用途', help: '使う在庫の用途です(空欄は汎用)。' },
    { name: 'warehouse', label: '倉庫', help: '' },
    { name: 'allocated_quantity', label: '引当数量', help: '', align: 'end' },
    { name: 'status', label: '状態', help: '' },
];
// 列名・説明の「部品」「ピッキング」「出庫」を、用語設定の呼び方に置き換える
registerTermTarget(PICKING_MOBILE_COLUMNS);

interface DisplaySettingLike {
    model_field_name: string;
    display_name?: string | null;
    display_order: number;
    is_list_display: boolean;
}

/** 設定(表示/非表示・並び順・表示名)を列定義に適用する。設定が無い列は既定の位置に表示する */
export function applyColumnSettings(columns: PickingColumn[], settings: DisplaySettingLike[]): (PickingColumn & { title: string })[] {
    if (settings.length === 0) return columns.map(c => ({ ...c, title: c.label }));
    const byName = new Map(settings.map(s => [s.model_field_name, s]));
    return columns
        .map((c, index) => ({ c, setting: byName.get(c.name), index }))
        .filter(({ setting }) => !setting || setting.is_list_display)
        .sort((a, b) => (a.setting?.display_order ?? (a.index + 1) * 10) - (b.setting?.display_order ?? (b.index + 1) * 10))
        .map(({ c, setting }) => ({ ...c, title: setting?.display_name || c.label }));
}
