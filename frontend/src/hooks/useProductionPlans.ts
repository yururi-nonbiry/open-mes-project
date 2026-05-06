import { useState, useCallback, useEffect } from 'react';
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

    const fetchPlans = useCallback(async (pageUrl: string | null = null) => {
        setLoading(true);
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
            params.append('page_size', pageSize.toString());
            if (filters.plan_name) params.append('plan_name', filters.plan_name);
            if (filters.product_code) params.append('product_code', filters.product_code);
            if (filters.status) params.append('status', filters.status);
            if (filters.parent_plan_ref) params.append('production_plan_ref', filters.parent_plan_ref);
            if (filters.planned_start_from) params.append('planned_start_datetime_after', filters.planned_start_from);
            if (filters.planned_start_to) params.append('planned_start_datetime_before', filters.planned_start_to);
            currentUrl = `/api/production/plans/?${params.toString()}`;
        }

        try {
            const data = await productionService.getProductionPlans(params);
            setPlans(data.results || []);
            updatePagination(data, currentUrl);
        } catch (e: any) {
            setError('生産計画データの取得中にエラーが発生しました。');
            setPlans([]);
        } finally {
            setLoading(false);
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
