import { useState, useCallback, useEffect, useRef } from 'react';
import productionService, { ProductionPlan } from '../services/productionService';
import { usePagination } from './usePagination';
import { useFilters } from './useFilters';

export const useProductionPlans = () => {
    const pageSize = 100;
    const [plans, setPlans] = useState<ProductionPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { pagination, pageInfo, updatePagination } = usePagination(pageSize);
    const { filters, handleFilterChange, resetFilters } = useFilters({
        plan_name: '',
        product_code: '',
        status: '',
        parent_plan_ref: '',
        planned_start_from: '',
        planned_start_to: '',
    }, { field: 'id', direction: 'asc' });

    // 入力のたびに検索するため、古い検索の遅れた応答で最新の結果を上書きしないよう、最新の検索だけを反映する
    const latestRequest = useRef(0);

    const fetchPlans = useCallback(async (pageUrl: string | null = null) => {
        const requestId = ++latestRequest.current;
        setLoading(true);
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
            params.append('page_size', pageSize.toString());
            if (filters.plan_name) params.append('plan_name', filters.plan_name);
            if (filters.product_code) params.append('product_code', filters.product_code);
            if (filters.status) params.append('status__in', filters.status);
            if (filters.parent_plan_ref) params.append('production_plan_ref', filters.parent_plan_ref);
            if (filters.planned_start_from) params.append('planned_start_datetime_after', filters.planned_start_from);
            if (filters.planned_start_to) params.append('planned_start_datetime_before', `${filters.planned_start_to}T23:59:59`);
            currentUrl = `/api/production/plans/?${params.toString()}`;
        }

        try {
            const data = await productionService.getProductionPlans(Object.fromEntries(params.entries()));
            if (requestId !== latestRequest.current) return;
            setPlans(data.results || []);
            updatePagination(data, currentUrl);
        } catch {
            if (requestId !== latestRequest.current) return;
            setError('生産計画データの取得中にエラーが発生しました。');
            setPlans([]);
        } finally {
            if (requestId === latestRequest.current) setLoading(false);
        }
    }, [filters, pageSize, updatePagination]);

    useEffect(() => {
        fetchPlans();
    }, [fetchPlans]);

    return {
        plans,
        loading,
        error,
        pagination,
        pageInfo,
        filters,
        handleFilterChange,
        handleSearch: () => fetchPlans(null),
        handleClearSearch: resetFilters,
        fetchPlans
    };
};
