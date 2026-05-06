import { useState, useCallback, useEffect } from 'react';
import productionService, { ProductionPlan } from '../services/productionService';
import { usePagination } from './usePagination';
import { useFilters } from './useFilters';

const AVAILABLE_STATUSES = [
    { key: 'PENDING', label: '未着手', btnClass: 'btn-secondary', btnOutlineClass: 'btn-outline-secondary', default_selected: true },
    { key: 'IN_PROGRESS', label: '進行中', btnClass: 'btn-info', btnOutlineClass: 'btn-outline-info', default_selected: true },
    { key: 'COMPLETED', label: '完了', btnClass: 'btn-success', btnOutlineClass: 'btn-outline-success', default_selected: false },
    { key: 'ON_HOLD', label: '保留', btnClass: 'btn-warning', btnOutlineClass: 'btn-outline-warning', default_selected: true },
    { key: 'CANCELLED', label: '中止', btnClass: 'btn-danger', btnOutlineClass: 'btn-outline-danger', default_selected: false }
];

const getDefaultSelectedStatuses = () => {
    return new Set(AVAILABLE_STATUSES.filter(s => s.default_selected).map(s => s.key));
};

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

    const buildApiUrl = useCallback((pageUrl: string | null = null) => {
        if (pageUrl) return pageUrl;

        const params = new URLSearchParams();
        params.append('page_size', pageSize.toString());
        const sortOrderPrefix = sorting.direction === 'desc' ? '-' : '';
        params.append('ordering', `${sortOrderPrefix}${sorting.field}`);

        if (filters.plan_name) params.append('plan_name', filters.plan_name);
        if (filters.product_code) params.append('product_code', filters.product_code);
        if (filters.planned_start_after) params.append('planned_start_datetime_after', filters.planned_start_after);
        if (filters.planned_start_before) params.append('planned_start_datetime_before', `${filters.planned_start_before}T23:59:59`);

        if (statusFilters.size > 0 && statusFilters.size < AVAILABLE_STATUSES.length) {
            params.append('status__in', Array.from(statusFilters).join(','));
        }

        return `/api/production/plans/?${params.toString()}`;
    }, [filters, statusFilters, sorting, pageSize]);

    const fetchPlans = useCallback(async (pageUrl: string | null = null) => {
        if (statusFilters.size === 0) {
            setPlans([]);
            setPageInfo('表示するステータスが選択されていません。');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        const currentUrl = buildApiUrl(pageUrl);
        const params = new URL(currentUrl, window.location.origin).searchParams;

        try {
            const data = await productionService.getProductionPlans(params);
            setPlans(data.results || []);
            updatePagination(data, currentUrl);
        } catch (e: any) {
            setError(`データの読み込みに失敗しました: ${e.message}`);
            setPlans([]);
        } finally {
            setLoading(false);
        }
    }, [buildApiUrl, statusFilters, updatePagination, setPageInfo]);

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
