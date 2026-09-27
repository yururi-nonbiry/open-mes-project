import authFetch, { apiRequest, buildQueryString, handleError } from '../utils/api';
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
    PartsSupplySimulationResult,
    PlanMaterial,
    AdditionalIssueItem,
    MaterialAllocation,
    IntermediateRequirement,
    IntermediateDecision
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

    /** 生産計画の所要部品(部品構成)の一覧 */
    getPlanMaterials: (planId: string) =>
        apiRequest<PlanMaterial[]>(
            `/api/production/plan-materials/?production_plan_id=${encodeURIComponent(planId)}`,
            {},
            '部品構成の取得に失敗しました。'
        ),

    savePlanMaterial: (material: PlanMaterial) => {
        const url = material.id ? `/api/production/plan-materials/${material.id}/` : '/api/production/plan-materials/';
        return apiRequest<PlanMaterial>(url, {
            method: material.id ? 'PATCH' : 'POST',
            body: JSON.stringify(material),
        }, '部品構成の保存に失敗しました。');
    },

    deletePlanMaterial: (id: string) =>
        apiRequest(`/api/production/plan-materials/${id}/`, { method: 'DELETE' }, '部品構成の削除に失敗しました。'),

    /** 計画の部品構成をBOMマスターから読み込み直す(計画ごとの編集内容は破棄される) */
    resetPlanMaterials: (planId: string) =>
        apiRequest<{ message: string; data: PlanMaterial[] }>(
            `/api/production/plans/${planId}/reset-materials/`,
            { method: 'POST' },
            '部品構成の初期化に失敗しました。'
        ),

    /** 歩留まり・ロス等の不足分を追加出庫する(引当を経ずに即時出庫) */
    issueAdditionalMaterials: (planId: string, items: AdditionalIssueItem[], remarks: string) =>
        apiRequest<{ message: string; data: MaterialAllocation[] }>(
            `/api/production/plans/${planId}/issue-additional-materials/`,
            { method: 'POST', body: JSON.stringify({ items, remarks }) },
            '追加出庫に失敗しました。'
        ),

    /** 中間品ごとの手配状況(在庫の見込み・子計画・不足) */
    getIntermediateRequirements: (planId: string) =>
        apiRequest<IntermediateRequirement[]>(
            `/api/production/plans/${planId}/intermediate-requirements/`,
            {},
            '中間品の手配状況の取得に失敗しました。'
        ),

    /** 中間品の手配方法を決める(子計画を立てる / 在庫を使う) */
    arrangeIntermediates: (planId: string, decisions: IntermediateDecision[]) =>
        apiRequest<{
            message: string;
            data: { created_plans: ProductionPlan[]; requirements: IntermediateRequirement[] };
        }>(
            `/api/production/plans/${planId}/arrange-intermediates/`,
            { method: 'POST', body: JSON.stringify({ decisions }) },
            '中間品の手配に失敗しました。'
        ),

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
