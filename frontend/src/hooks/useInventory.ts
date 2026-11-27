import { useState, useCallback, useEffect, useRef } from 'react';
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
            // 列名は表示設定APIが返す項目名を使い、管理者専用の model-fields は呼ばない
            // (一般ユーザーが呼ぶと403になり、権限エラーとして監査ログに記録されてしまうため)
            const settings = await inventoryService.getDisplaySettings('inventory');
            const combinedSettings = settings.map((setting) => ({
                ...setting,
                verbose_name: setting.verbose_name || setting.model_field_name,
            }));

            setDisplaySettings(combinedSettings
                .filter((s) => s.is_list_display)
                .sort((a, b) => a.display_order - b.display_order)
            );

            setSearchFields(combinedSettings
                .filter((s) => s.is_search_field)
                .sort((a, b) => a.search_order - b.search_order)
            );
        } catch (e) {
            console.error('Failed to fetch settings:', e);
        }
    }, []);

    // 入力のたびに検索するため、後から送った検索の結果を古い検索の遅れた応答で上書きしないよう、最新の検索だけを反映する
    const latestRequest = useRef(0);

    const fetchInventory = useCallback(async (pageUrl: string | null = null) => {
        const requestId = ++latestRequest.current;
        setIsLoading(true);
        setError(null);

        let params: URLSearchParams;
        let currentUrl: string;

        if (pageUrl) {
            try {
                const url = new URL(pageUrl);
                params = url.searchParams;
                currentUrl = url.pathname + url.search;
            } catch {
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
            // 総ページ数の計算と同じ件数で取得する(送らないとサーバー既定の25件になり、ページ数の表示がずれる)
            params.append('page_size', String(pageSize));
            currentUrl = `/api/inventory/inventories/?${params.toString()}`;
        }

        try {
            const data = await inventoryService.getInventories(params);
            if (requestId !== latestRequest.current) return;
            const results = data.results || [];

            if (results.length > 0) {
                const partNumbers = [...new Set(results.map((item) => item.part_number).filter(Boolean))] as string[];
                if (partNumbers.length > 0) {
                    const items = await inventoryService.getItemNames(partNumbers);
                    const partNameMap = new Map(items.map((item) => [item.code, item.name]));
                    results.forEach((inv) => {
                        inv.part_name = partNameMap.get(inv.part_number) || '';
                    });
                }
            }

            if (requestId !== latestRequest.current) return;
            setInventory(results);
            updatePagination(data, currentUrl);
        } catch (err) {
            if (requestId !== latestRequest.current) return;
            setError('在庫データの取得中にエラーが発生しました。');
            console.error(err);
        } finally {
            if (requestId === latestRequest.current) setIsLoading(false);
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
