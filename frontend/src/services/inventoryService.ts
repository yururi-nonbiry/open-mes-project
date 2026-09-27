import authFetch from '../utils/api';
import { WarehouseLocationMap } from './warehouseLocationService';

export interface InventoryItem {
    id: string | number;
    part_number: string;
    part_name?: string;
    warehouse: string;
    location: string;
    quantity: number;
    reserved: number;
    available_quantity: number;
    last_updated?: string;
    is_active: boolean;
    is_allocatable: boolean;
    [key: string]: string | number | boolean | undefined | null;
}

export interface SalesOrder {
    id: string;
    order_number: string;
    item: string | null;
    quantity: number;
    shipped_quantity: number;
    reserved_quantity: number;
    remaining_quantity: number;
    order_date: string;
    expected_shipment: string | null;
    warehouse: string | null;
    status: string;
    status_display: string;
    is_internal: boolean;
}

export interface PaginatedResponse<T> {
    count: number;
    total_pages: number;
    current_page: number;
    page_size: number;
    results: T[];
}

export interface IssueResult {
    ok: boolean;
    message: string;
}

/** 出庫数量の入力チェック。問題があればエラーメッセージ、なければ null を返す。 */
export const validateIssueQuantity = (input: string, remainingQuantity: number): string | null => {
    const quantity = parseInt(input, 10);
    if (isNaN(quantity) || quantity <= 0) return '出庫数量は1以上の正の整数である必要があります。';
    if (quantity > remainingQuantity) return '出庫数量が残数量を超えています。';
    return null;
};

export interface DisplaySetting {
    model_field_name: string;
    display_name: string;
    verbose_name: string;
    display_order: number;
    is_list_display: boolean;
    is_search_field: boolean;
    search_order: number;
}

const inventoryService = {
    getInventories: async (params: URLSearchParams) => {
        const response = await authFetch(`/api/inventory/inventories/?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch inventories');
        return await response.json();
    },

    getDisplaySettings: async (dataType: string) => {
        const response = await authFetch(`/api/base/model-display-settings/?data_type=${dataType}`);
        if (!response.ok) throw new Error('Failed to fetch display settings');
        return await response.json() as DisplaySetting[];
    },

    getModelFields: async (dataType: string) => {
        const response = await authFetch(`/api/base/model-fields/?data_type=${dataType}`);
        if (!response.ok) throw new Error('Failed to fetch model fields');
        return await response.json();
    },

    getItemNames: async (codes: string[]) => {
        const response = await authFetch(`/api/master/items/?code__in=${codes.join(',')}`);
        if (!response.ok) throw new Error('Failed to fetch item names');
        const data = await response.json();
        return data.results || data.data || data || [];
    },

    updateInventory: async (id: string | number, payload: Record<string, any>) => {
        // quantity/location の変更は在庫移動履歴(StockMovement)の記録を伴うため、
        // 専用の /adjust/ アクション経由で行う（直接のPATCHはquantity/reservedを受け付けない）。
        const response = await authFetch(`/api/inventory/inventories/${id}/adjust/`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.detail || 'Failed to update inventory');
        return data;
    },

    moveInventory: async (id: string | number, payload: Record<string, any>) => {
        const response = await authFetch(`/api/inventory/inventories/${id}/move/`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.detail || 'Failed to move inventory');
        return data;
    },

    /**
     * 出庫画面向けの受注一覧。材料引当用の内部受注(INT-)は出庫APIの対象外のため常に除外する。
     */
    getIssuableSalesOrders: async (
        { page = 1, pageSize, q, status }: { page?: number; pageSize?: number; q?: string; status?: string } = {}
    ) => {
        const params = new URLSearchParams({ page: String(page), exclude_internal: 'true' });
        if (pageSize) params.append('page_size', String(pageSize));
        if (q) params.append('search_q', q);
        if (status) params.append('search_status', status);
        const response = await authFetch(`/api/inventory/sales-orders/?${params.toString()}`);
        if (!response.ok) throw new Error('データの読み込みに失敗しました。');
        return await response.json() as PaginatedResponse<SalesOrder>;
    },

    /** 受注の出庫。業務エラーは ok=false とサーバーのメッセージで返し、通信エラーは例外を送出する。 */
    issueSalesOrder: async (orderId: string, quantityToShip: number): Promise<IssueResult> => {
        const response = await authFetch('/api/inventory/sales-orders/issue/', {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId, quantity_to_ship: quantityToShip }),
        });
        const data = await response.json();
        if (response.ok && data.success) {
            return { ok: true, message: data.message || '出庫処理が正常に完了しました。' };
        }
        return { ok: false, message: data.error || '出庫処理中にエラーが発生しました。' };
    },

    getSalesOrderLocationMap: async (orderId: string | number) => {
        const response = await authFetch(`/api/inventory/sales-orders/${orderId}/location-map/`);
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw new Error(data.message || data.error || 'ロケーションマップの取得に失敗しました。');
        }
        return data.data as WarehouseLocationMap;
    }
};

export default inventoryService;
