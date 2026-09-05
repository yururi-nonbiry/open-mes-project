import authFetch from '../utils/api';

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
        const response = await authFetch('/api/master/bill-of-materials/');
        if (!response.ok) throw new Error('使用部品マスターの取得に失敗しました');
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.message || '使用部品マスターの取得に失敗しました');
        return data.data as BillOfMaterial[];
    },

    createBillOfMaterial: async (item: BillOfMaterial) => {
        const response = await authFetch('/api/master/bill-of-materials/', {
            method: 'POST',
            body: JSON.stringify(item),
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw { message: data.message || '登録に失敗しました', data: data.data || data };
        }
        return data;
    },

    updateBillOfMaterial: async (id: string, item: BillOfMaterial) => {
        const response = await authFetch(`/api/master/bill-of-materials/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(item),
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw { message: data.message || '更新に失敗しました', data: data.data || data };
        }
        return data;
    },

    deleteBillOfMaterial: async (id: string) => {
        const response = await authFetch(`/api/master/bill-of-materials/${id}/`, {
            method: 'DELETE',
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw new Error(data.message || '削除に失敗しました');
        }
        return data;
    },
};

export default bomService;
