import authFetch, { buildQueryString, handleError } from '../utils/api';
import { 
    ProductionPlan, 
    PaginationData, 
    ProductionPlanFilters, 
    RequiredPart,
    ProgressUpdatePayload,
    UpdateProgressResponse,
    MaterialAllocationPayload,
    AllocateMaterialsResponse
} from '../types/production';

/**
 * フィルターオブジェクトをAPIパラメータに変換します。
 */
const mapFiltersToApiParams = (
    filters: any, 
    sorting: { field: string, direction: 'asc' | 'desc' }, 
    statusFilters: Set<string>,
    pageSize: number
): ProductionPlanFilters => {
    const apiFilters: ProductionPlanFilters = {
        page_size: pageSize,
        ordering: `${sorting.direction === 'desc' ? '-' : ''}${sorting.field}`,
        plan_name: filters.plan_name,
        product_code: filters.product_code,
        planned_start_datetime_after: filters.planned_start_after,
        planned_start_datetime_before: filters.planned_start_before ? `${filters.planned_start_before}T23:59:59` : undefined,
    };

    if (statusFilters.size > 0) {
        apiFilters.status__in = Array.from(statusFilters).join(',');
    }

    return apiFilters;
};

const productionService = {
    /**
     * 生産計画一覧を取得します（パラメータ変換機能付き）
     */
    getProductionPlansFiltered: async (
        filters: any,
        sorting: { field: string, direction: 'asc' | 'desc' },
        statusFilters: Set<string>,
        pageSize: number
    ) => {
        const apiParams = mapFiltersToApiParams(filters, sorting, statusFilters, pageSize);
        const queryString = buildQueryString(apiParams);
        const response = await authFetch(`/api/production/plans/${queryString}`);
        await handleError(response, 'Failed to fetch production plans');
        return await response.json() as PaginationData<ProductionPlan>;
    },

    getProductionPlans: async (filters: ProductionPlanFilters = {}) => {
        const queryString = buildQueryString(filters);
        const response = await authFetch(`/api/production/plans/${queryString}`);
        await handleError(response, 'Failed to fetch production plans');
        return await response.json() as PaginationData<ProductionPlan>;
    },

    getProductionPlansByUrl: async (url: string) => {
        const response = await authFetch(url);
        await handleError(response, 'Failed to fetch production plans');
        return await response.json() as PaginationData<ProductionPlan>;
    },

    updateProgress: async (id: string, payload: ProgressUpdatePayload) => {
        const response = await authFetch(`/api/production/plans/${id}/update-progress/`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        await handleError(response, 'Failed to update progress');
        return await response.json() as UpdateProgressResponse;
    },

    getRequiredParts: async (id: string) => {
        const response = await authFetch(`/api/production/plans/${id}/required-parts/`);
        await handleError(response, 'Failed to fetch required parts');
        return await response.json() as RequiredPart[];
    },

    allocateMaterials: async (id: string, allocations: MaterialAllocationPayload['allocations']) => {
        const response = await authFetch(`/api/production/plans/${id}/allocate-materials/`, {
            method: 'POST',
            body: JSON.stringify({ allocations })
        });
        await handleError(response, 'Allocation failed');
        return await response.json() as AllocateMaterialsResponse;
    }
};

export default productionService;
export type { ProductionPlan, PaginationData };
