import { apiRequest } from '../utils/api';

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
        const data = await apiRequest('/api/master/warehouses/', {}, '倉庫一覧の取得に失敗しました。');
        return (data.data || []) as Warehouse[];
    },

    saveWarehouseLayout: (warehouse: Warehouse) =>
        apiRequest(
            `/api/master/warehouses/${warehouse.id}/`,
            { method: 'PUT', body: JSON.stringify(warehouse) },
            '倉庫レイアウト設定の保存に失敗しました。'
        ),

    getLocations: async (warehouseNumber: string) => {
        const data = await apiRequest(
            `/api/master/warehouse-locations/?warehouse=${encodeURIComponent(warehouseNumber)}`,
            {},
            'ロケーション一覧の取得に失敗しました。'
        );
        return (data.data || []) as WarehouseLocation[];
    },

    saveLocation: (location: WarehouseLocation) => {
        const url = location.id ? `/api/master/warehouse-locations/${location.id}/` : '/api/master/warehouse-locations/';
        const method = location.id ? 'PUT' : 'POST';
        return apiRequest(url, { method, body: JSON.stringify(location) }, 'ロケーションの保存に失敗しました。');
    },

    deleteLocation: (id: string) =>
        apiRequest(`/api/master/warehouse-locations/${id}/`, { method: 'DELETE' }, 'ロケーションの削除に失敗しました。'),
};

export default warehouseLocationService;
