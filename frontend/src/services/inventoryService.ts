import authFetch from '../utils/api';

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
        const response = await authFetch(`/api/inventory/inventories/${id}/`, {
            method: 'PATCH',
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
    }
};

export default inventoryService;
