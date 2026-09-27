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

const bomService = {
    getBillOfMaterials: async () => {
        const data = await apiRequest('/api/master/bill-of-materials/', {}, '使用部品マスターの取得に失敗しました');
        return data.data as BillOfMaterial[];
    },

    createBillOfMaterial: (item: BillOfMaterial) =>
        apiRequest('/api/master/bill-of-materials/', { method: 'POST', body: JSON.stringify(item) }, '登録に失敗しました'),

    updateBillOfMaterial: (id: string, item: BillOfMaterial) =>
        apiRequest(`/api/master/bill-of-materials/${id}/`, { method: 'PATCH', body: JSON.stringify(item) }, '更新に失敗しました'),

    deleteBillOfMaterial: (id: string) =>
        apiRequest(`/api/master/bill-of-materials/${id}/`, { method: 'DELETE' }, '削除に失敗しました'),
};

export default bomService;
