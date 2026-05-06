import { useState, useCallback, useEffect } from 'react';
import productionService from '../services/productionService';
import { usePagination } from './usePagination';
import { useFilters } from './useFilters';
import { 
    ProductionPlan, 
    PaginationData,
    AVAILABLE_STATUSES, 
    getDefaultSelectedStatuses,
    ProductionPlanFilters
} from '../types/production';

export const useWorkProgress = () => {
    const pageSize = 10;
    const [plans, setPlans] = useState<ProductionPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { pagination, pageInfo, updatePagination, setPageInfo } = usePagination(pageSize);
    const { filters, sorting, handleFilterChange, handleSort, resetFilters } = useFilters({
        plan_name: '',
        product_code: '',
        planned_start_after: '',
        planned_start_before: '',
    }, { field: 'planned_start_datetime', direction: 'desc' });

    const [statusFilters, setStatusFilters] = useState<Set<string>>(getDefaultSelectedStatuses());

    const fetchPlans = useCallback(async (pageUrl: string | null = null) => {
        if (statusFilters.size === 0) {
            setPlans([]);
            setPageInfo('表示するステータスが選択されていません。');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            let data: PaginationData<ProductionPlan>;

            if (pageUrl) {
                // ページ遷移の場合
                data = await productionService.getProductionPlansByUrl(pageUrl);
            } else {
                // フィルターやソートによる検索の場合
                const apiFilters: ProductionPlanFilters = {
                    page_size: pageSize,
                    ordering: `${sorting.direction === 'desc' ? '-' : ''}${sorting.field}`,
                    plan_name: filters.plan_name,
                    product_code: filters.product_code,
                    planned_start_datetime_after: filters.planned_start_after,
                    planned_start_datetime_before: filters.planned_start_before ? `${filters.planned_start_before}T23:59:59` : undefined,
                };

                if (statusFilters.size > 0 && statusFilters.size < AVAILABLE_STATUSES.length) {
                    apiFilters.status__in = Array.from(statusFilters).join(',');
                }

                data = await productionService.getProductionPlans(apiFilters);
            }

            setPlans(data.results || []);
            // Paginationの更新。pageUrlがあればそれを使用し、なければ現在の検索条件から推測（ただしDRFはnext/previousにURLを含めるので基本不要）
            updatePagination(data, pageUrl || '');
        } catch (e: any) {
            setError(`データの読み込みに失敗しました: ${e.message}`);
            setPlans([]);
        } finally {
            setLoading(false);
        }
    }, [filters, statusFilters, sorting, pageSize, updatePagination, setPageInfo]);

    useEffect(() => {
        fetchPlans();
    }, [fetchPlans]);

    const handleStatusFilterChange = useCallback((statusKey: string) => {
        setStatusFilters(prev => {
            const next = new Set(prev);
            if (next.has(statusKey)) next.delete(statusKey);
            else next.add(statusKey);
            return next;
        });
    }, []);

    const handleReset = useCallback(() => {
        resetFilters();
        setStatusFilters(getDefaultSelectedStatuses());
    }, [resetFilters]);

    return {
        plans,
        loading,
        error,
        pagination,
        pageInfo,
        filters,
        sorting,
        statusFilters,
        AVAILABLE_STATUSES,
        handleFilterChange,
        handleSort,
        handleStatusFilterChange,
        handleSearch: () => fetchPlans(null),
        handleReset,
        fetchPlans
    };
};
