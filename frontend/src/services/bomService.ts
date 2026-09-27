import { apiRequest } from '../utils/api';

export interface BillOfMaterial {
    id?: string;
    product: string;
    product_name?: string;
    material: string;
    material_name?: string;
    material_unit?: string;
    quantity: number | string;
    remarks?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface MasterItem {
    id: string;
    code: string;
    name: string;
    /** 表示名("Product" / "Material" / "Intermediate")で返る */
    item_type: string;
    unit?: string;
}

const itemTypeOf = (item: MasterItem) => item.item_type?.toLowerCase();
/** 生産計画で作れる品目(BOMの親になれる品目): 製品・中間品 */
export const isProducibleItem = (item: MasterItem) => ['product', 'intermediate'].includes(itemTypeOf(item));
/** 部品として使える品目(BOMの子になれる品目): 材料・中間品 */
export const isConsumableItem = (item: MasterItem) => ['material', 'intermediate'].includes(itemTypeOf(item));
export const itemTypeLabel = (itemType: string) =>
    ({ product: '製品', material: '材料', intermediate: '中間品' } as Record<string, string>)[itemType?.toLowerCase()] || itemType;

export interface BomExplosionNode {
    item_code: string;
    item_name: string;
    item_type: string;
    unit: string;
    level: number;
    quantity_per_parent: string;
    required_quantity: string;
    children: BomExplosionNode[];
}

export interface BomExplosion {
    item_code: string;
    item_name: string;
    quantity: string;
    tree: BomExplosionNode[];
    /** 最下位の品目ごとの合計所要量(中間品は含まない) */
    totals: { item_code: string; item_name: string; unit: string; required_quantity: string }[];
}

const bomService = {
    getBillOfMaterials: async () => {
        const data = await apiRequest('/api/master/bill-of-materials/', {}, '使用部品マスターの取得に失敗しました');
        return data.data as BillOfMaterial[];
    },

    createBillOfMaterial: (item: BillOfMaterial) =>
        apiRequest('/api/master/bill-of-materials/', { method: 'POST', body: JSON.stringify(item) }, '登録に失敗しました'),

    updateBillOfMaterial: (id: string, item: BillOfMaterial) =>
        apiRequest(`/api/master/bill-of-materials/${id}/`, { method: 'PATCH', body: JSON.stringify(item) }, '更新に失敗しました'),

    getItems: async () => {
        const data = await apiRequest('/api/master/items/', {}, '品目一覧の取得に失敗しました');
        return (data.data || []) as MasterItem[];
    },

    /** 多階層BOMを全階層展開する */
    explodeBom: async (product: string, quantity: number | string = 1) => {
        const params = new URLSearchParams({ product, quantity: String(quantity) });
        const data = await apiRequest(`/api/master/bill-of-materials/explode/?${params.toString()}`, {}, 'BOMの展開に失敗しました');
        return data.data as BomExplosion;
    },

    deleteBillOfMaterial: (id: string) =>
        apiRequest(`/api/master/bill-of-materials/${id}/`, { method: 'DELETE' }, '削除に失敗しました'),
};

export default bomService;
