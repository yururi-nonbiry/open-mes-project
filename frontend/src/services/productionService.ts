import authFetch, { buildQueryString, handleError } from '../utils/api';
import {
    ProductionPlan,
    PaginationData,
    ProductionPlanFilters,
    RequiredPart,
    ProgressUpdatePayload,
    UpdateProgressResponse,
    MaterialAllocationPayload,
    AllocateMaterialsResponse,
    WorkProgress,
    PartsSupplySimulationResult
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
    },

    getWorkProgressForPlan: async (planId: string) => {
        const response = await authFetch(`/api/production/work-progress/?production_plan_id=${planId}`);
        await handleError(response, 'Failed to fetch work progress');
        const data = await response.json() as PaginationData<WorkProgress>;
        return data.results;
    },

    getPartsSupplySimulation: async (params: { planIds?: string[]; statuses?: string[] }) => {
        const queryParams: Record<string, string> = {};
        if (params.planIds && params.planIds.length > 0) {
            queryParams.plan_ids = params.planIds.join(',');
        } else if (params.statuses && params.statuses.length > 0) {
            queryParams.status = params.statuses.join(',');
        }
        const queryString = buildQueryString(queryParams);
        const response = await authFetch(`/api/production/parts-supply-simulation/${queryString}`);
        await handleError(response, '部品供給シミュレーションの取得に失敗しました');
        return await response.json() as PartsSupplySimulationResult;
    }
};

export default productionService;
export type { ProductionPlan, PaginationData };
