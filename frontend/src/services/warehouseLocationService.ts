import authFetch from '../utils/api';

export interface Warehouse {
    id?: string;
    warehouse_number: string;
    name: string;
    location?: string;
    layout_cols: number;
    layout_rows: number;
}

export interface WarehouseLocation {
    id?: string;
    warehouse: string; // warehouse_number
    code: string;
    name?: string;
    pos_x: number;
    pos_y: number;
    width: number;
    height: number;
}

export interface WarehouseLocationMapEntry {
    code: string;
    name: string;
    pos_x: number;
    pos_y: number;
    width: number;
    height: number;
    quantity: number;
    highlighted: boolean;
}

export interface WarehouseLocationMap {
    warehouse: {
        warehouse_number: string;
        name: string;
        cols: number;
        rows: number;
    };
    locations: WarehouseLocationMapEntry[];
}

const warehouseLocationService = {
    getWarehouses: async () => {
        const response = await authFetch('/api/master/warehouses/');
        if (!response.ok) throw new Error('倉庫一覧の取得に失敗しました。');
        const data = await response.json();
        return (data.data || []) as Warehouse[];
    },

    saveWarehouseLayout: async (warehouse: Warehouse) => {
        const response = await authFetch(`/api/master/warehouses/${warehouse.id}/`, {
            method: 'PUT',
            body: JSON.stringify(warehouse),
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw new Error(data.message || '倉庫レイアウト設定の保存に失敗しました。');
        }
        return data;
    },

    getLocations: async (warehouseNumber: string) => {
        const response = await authFetch(`/api/master/warehouse-locations/?warehouse=${encodeURIComponent(warehouseNumber)}`);
        if (!response.ok) throw new Error('ロケーション一覧の取得に失敗しました。');
        const data = await response.json();
        return (data.data || []) as WarehouseLocation[];
    },

    saveLocation: async (location: WarehouseLocation) => {
        const url = location.id ? `/api/master/warehouse-locations/${location.id}/` : '/api/master/warehouse-locations/';
        const method = location.id ? 'PUT' : 'POST';
        const response = await authFetch(url, {
            method,
            body: JSON.stringify(location),
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw { message: data.message || 'ロケーションの保存に失敗しました。', data: data.data || data };
        }
        return data;
    },

    deleteLocation: async (id: string) => {
        const response = await authFetch(`/api/master/warehouse-locations/${id}/`, {
            method: 'DELETE',
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw new Error(data.message || 'ロケーションの削除に失敗しました。');
        }
        return data;
    },
};

export default warehouseLocationService;
