import authFetch, { apiRequest } from '../utils/api';

/** ピッキング画面のキーワード検索で対象にできる項目(キーはAPIと共通)。 */
export const PICKING_SEARCH_FIELDS = [
    { key: 'product_code', label: '完成品の品番' },
    { key: 'product_name', label: '完成品の品名' },
    { key: 'plan_name', label: '計画名' },
    { key: 'line', label: '出庫先ライン' },
    { key: 'purpose', label: '使用用途' },
    { key: 'material_code', label: '部品の品番' },
    { key: 'material_name', label: '部品の品名' },
] as const;

export type PickingSearchField = typeof PICKING_SEARCH_FIELDS[number]['key'];

/** 未設定時・取得失敗時の検索対象(使用用途は含まない。バックエンドの既定と同じ)。 */
export const DEFAULT_PICKING_SEARCH_FIELDS: PickingSearchField[] =
    PICKING_SEARCH_FIELDS.map((f) => f.key).filter((k) => k !== 'purpose');

const pickingSearchFieldsService = {
    /** 検索対象項目の取得。失敗した場合はすべての項目を対象にする。 */
    get: async (): Promise<PickingSearchField[]> => {
        try {
            const response = await authFetch('/api/base/picking-search-fields/');
            if (!response.ok) return DEFAULT_PICKING_SEARCH_FIELDS;
            return (await response.json() as { fields: PickingSearchField[] }).fields;
        } catch (_err) {
            return DEFAULT_PICKING_SEARCH_FIELDS;
        }
    },

    /** 検索対象項目の更新(管理者のみ)。失敗時は ApiError を送出する。 */
    update: (fields: PickingSearchField[]) =>
        apiRequest<{ fields: PickingSearchField[] }>(
            '/api/base/picking-search-fields/',
            { method: 'PUT', body: JSON.stringify({ fields }) },
            '検索対象の保存に失敗しました。'
        ),
};

export default pickingSearchFieldsService;
