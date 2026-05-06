import { useState, useCallback, useEffect } from 'react';
import inventoryService, { InventoryItem, DisplaySetting } from '../services/inventoryService';
import { usePagination } from './usePagination';
import { useFilters } from './useFilters';

export const useInventory = () => {
    const pageSize = 10;
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [displaySettings, setDisplaySettings] = useState<DisplaySetting[]>([]);
    const [searchFields, setSearchFields] = useState<DisplaySetting[]>([]);

    const { pagination, pageInfo, updatePagination } = usePagination(pageSize);
    const { filters, handleFilterChange, resetFilters } = useFilters({
        hideZeroStock: true,
    }, { field: 'id', direction: 'asc' });

    const fetchSettings = useCallback(async () => {
        try {
            const [settings, fields] = await Promise.all([
                inventoryService.getDisplaySettings('inventory'),
                inventoryService.getModelFields('inventory')
            ]);

            const verboseNameMap = new Map(fields.map((f: any) => [f.name, f.verbose_name]));
            const combinedSettings = settings.map((setting: any) => ({
                ...setting,
                verbose_name: verboseNameMap.get(setting.model_field_name) || setting.model_field_name,
            }));

            setDisplaySettings(combinedSettings
                .filter((s: any) => s.is_list_display)
                .sort((a: any, b: any) => a.display_order - b.display_order)
            );

            setSearchFields(combinedSettings
                .filter((s: any) => s.is_search_field)
                .sort((a: any, b: any) => a.search_order - b.search_order)
            );
        } catch (e) {
            console.error('Failed to fetch settings:', e);
        }
    }, []);

    const fetchInventory = useCallback(async (pageUrl: string | null = null) => {
        setIsLoading(true);
        setError(null);

        let params: URLSearchParams;
        let currentUrl: string;

        if (pageUrl) {
            try {
                const url = new URL(pageUrl);
                params = url.searchParams;
                currentUrl = url.pathname + url.search;
            } catch (e) {
                params = new URLSearchParams(pageUrl.split('?')[1]);
                currentUrl = pageUrl;
            }
        } else {
            params = new URLSearchParams();
            for (const [key, value] of Object.entries(filters)) {
                if (key !== 'hideZeroStock' && value) {
                    params.append(`${key}_query`, String(value));
                }
            }
            params.append('hide_zero_stock_query', filters.hideZeroStock ? 'true' : 'false');
            currentUrl = `/api/inventory/inventories/?${params.toString()}`;
        }

        try {
            const data = await inventoryService.getInventories(params);
            const results = data.results || [];

            if (results.length > 0) {
                const partNumbers = [...new Set(results.map((item: any) => item.part_number).filter(Boolean))] as string[];
                if (partNumbers.length > 0) {
                    const items = await inventoryService.getItemNames(partNumbers);
                    const partNameMap = new Map(items.map((item: any) => [item.code, item.name]));
                    results.forEach((inv: any) => {
                        inv.part_name = partNameMap.get(inv.part_number) || '';
                    });
                }
            }

            setInventory(results);
            updatePagination(data, currentUrl);
        } catch (err: any) {
            setError('在庫データの取得中にエラーが発生しました。');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [filters, updatePagination]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        fetchInventory();
    }, [fetchInventory]);

    return {
        inventory,
        isLoading,
        error,
        displaySettings,
        searchFields,
        pagination,
        pageInfo,
        filters,
        handleFilterChange,
        handleSearch: () => fetchInventory(null),
        fetchInventory,
        resetFilters
    };
};
