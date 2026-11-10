import authFetch, { apiRequest, handleError, toApiError } from '../utils/api';
import { WarehouseLocationMap } from './warehouseLocationService';

export interface InventoryItem {
    id: string | number;
    part_number: string;
    part_name?: string;
    warehouse: string;
    location: string;
    /** 用途コード。null は汎用。 */
    purpose?: string | null;
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
    /** 使う在庫の用途コード(空は汎用のみ) */
    purpose?: string | null;
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

export interface FeatureOptions {
    /** 入庫時、デフォルト入庫棚番が未登録なら登録するか確認する */
    confirm_register_default_location: boolean;
}

const inventoryService = {
    getInventories: async (params: URLSearchParams) => {
        const response = await authFetch(`/api/inventory/inventories/?${params.toString()}`);
        await handleError(response, 'Failed to fetch inventories');
        return await response.json();
    },

    getDisplaySettings: async (dataType: string) => {
        const response = await authFetch(`/api/base/model-display-settings/?data_type=${dataType}`);
        await handleError(response, 'Failed to fetch display settings');
        return await response.json() as DisplaySetting[];
    },

    getModelFields: async (dataType: string) => {
        // 一覧の見出し用。品番・倉庫などの外部キー項目の名称も引けるよう、外部キーを含めて取得する
        const response = await authFetch(`/api/base/model-fields/?data_type=${dataType}&include_relations=true`);
        await handleError(response, 'Failed to fetch model fields');
        return await response.json();
    },

    getItemNames: async (codes: string[]) => {
        const response = await authFetch(`/api/master/items/?code__in=${codes.join(',')}`);
        await handleError(response, 'Failed to fetch item names');
        const data = await response.json();
        return data.results || data.data || data || [];
    },

    updateInventory: async (id: string | number, payload: Record<string, any>) => {
        // quantity/location の変更は在庫移動履歴(StockMovement)の記録を伴うため、
        // 専用の /adjust/ アクション経由で行う（直接のPATCHはquantity/reservedを受け付けない）。
        return apiRequest(
            `/api/inventory/inventories/${id}/adjust/`,
            { method: 'POST', body: JSON.stringify(payload) },
            'Failed to update inventory'
        );
    },

    /** 在庫の用途変更。purpose が空文字なら汎用への切り替え。 */
    changeInventoryPurpose: (id: string | number, payload: { quantity: number; purpose: string; reason?: string }) =>
        apiRequest<{ message: string }>(
            `/api/inventory/inventories/${id}/change-purpose/`,
            { method: 'POST', body: JSON.stringify(payload) },
            '用途の変更に失敗しました。'
        ),

    moveInventory: (id: string | number, payload: Record<string, any>) =>
        apiRequest(
            `/api/inventory/inventories/${id}/move/`,
            { method: 'POST', body: JSON.stringify(payload) },
            'Failed to move inventory'
        ),

    /**
     * 出庫画面向けの受注一覧。材料引当用の内部受注(INT-)は出庫APIの対象外のため常に除外する。
     */
    getIssuableSalesOrders: async (
        { page = 1, pageSize, q, status, expectedFrom, expectedTo }: { page?: number; pageSize?: number; q?: string; status?: string; expectedFrom?: string; expectedTo?: string } = {}
    ) => {
        const params = new URLSearchParams({ page: String(page), exclude_internal: 'true' });
        if (pageSize) params.append('page_size', String(pageSize));
        if (q) params.append('search_q', q);
        if (status) params.append('search_status', status);
        if (expectedFrom) params.append('search_expected_shipment_from', expectedFrom);
        if (expectedTo) params.append('search_expected_shipment_to', expectedTo);
        const response = await authFetch(`/api/inventory/sales-orders/?${params.toString()}`);
        await handleError(response, 'データの読み込みに失敗しました。');
        return await response.json() as PaginatedResponse<SalesOrder>;
    },

    /** 発注の入庫。失敗時は ApiError を送出する。 */
    receivePurchaseOrder: (payload: {
        purchase_order_id: string | number;
        received_quantity: number;
        warehouse: string;
        location: string;
        /** 用途コード。空文字は汎用。省略すると発注の用途を引き継ぐ。 */
        purpose?: string;
        /** true なら、品番のデフォルト入庫棚番が未登録のときに入庫した棚番を登録する。 */
        register_default_location?: boolean;
    }) =>
        apiRequest<{ message: string; order_number: string; default_location_registered?: boolean }>(
            '/api/inventory/purchase-orders/process-receipt/',
            { method: 'POST', body: JSON.stringify(payload) },
            '入庫処理に失敗しました。'
        ),

    /** 機能のON/OFF設定。取得に失敗した場合は確認しない(false)側に倒す。 */
    getFeatureOptions: async (): Promise<FeatureOptions> => {
        try {
            const response = await authFetch('/api/base/feature-options/');
            if (!response.ok) return { confirm_register_default_location: false };
            return await response.json() as FeatureOptions;
        } catch {
            return { confirm_register_default_location: false };
        }
    },

    /** 機能のON/OFF設定の更新(管理者のみ)。失敗時は ApiError を送出する。 */
    updateFeatureOptions: (payload: Partial<FeatureOptions>) =>
        apiRequest<FeatureOptions>(
            '/api/base/feature-options/',
            { method: 'PUT', body: JSON.stringify(payload) },
            '設定の保存に失敗しました。'
        ),

    /**
     * 入庫時に、入庫した棚番を品番のデフォルト入庫棚番として登録するか確認する。
     * 確認が不要(設定OFF・棚番なし・既に登録済み)な場合や、登録しない場合は false を返す。
     */
    confirmRegisterDefaultLocation: async (
        order: { part_number?: string | null; item_default_location?: string | null },
        location: string
    ): Promise<boolean> => {
        // item_default_location: null=品番なし、''=未登録、それ以外=登録済み
        if (!location || order.item_default_location !== '') return false;
        const options = await inventoryService.getFeatureOptions();
        if (!options.confirm_register_default_location) return false;
        return window.confirm(
            `品番「${order.part_number ?? ''}」のデフォルト入庫棚番が未登録です。\n` +
            `今回の棚番「${location}」をデフォルト入庫棚番として登録しますか？`
        );
    },

    /** 入庫予定の納品日・納品数の更新(記録のみで在庫には反映しない)。失敗時は ApiError を送出する。 */
    updatePurchaseOrderDelivery: (
        purchaseOrderId: string | number,
        payload: { delivery_date: string | null; delivered_quantity: number | null }
    ) =>
        apiRequest<{ id: string; order_number: string }>(
            `/api/inventory/purchase-orders/${purchaseOrderId}/`,
            { method: 'PATCH', body: JSON.stringify(payload) },
            '納品情報の更新に失敗しました。'
        ),

    /** 受注の出庫。失敗時は例外を送出せず ok=false とサーバーのメッセージで返す。 */
    issueSalesOrder: async (orderId: string, quantityToShip: number): Promise<IssueResult> => {
        const response = await authFetch('/api/inventory/sales-orders/issue/', {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId, quantity_to_ship: quantityToShip }),
        });
        if (!response.ok) {
            const error = await toApiError(response, '出庫処理中にエラーが発生しました。');
            return { ok: false, message: error.message };
        }
        const data = await response.json();
        return { ok: true, message: data.message || '出庫処理が正常に完了しました。' };
    },

    getSalesOrderLocationMap: async (orderId: string | number) => {
        const data = await apiRequest(
            `/api/inventory/sales-orders/${orderId}/location-map/`,
            {},
            'ロケーションマップの取得に失敗しました。'
        );
        return data.data as WarehouseLocationMap;
    }
};

export default inventoryService;
