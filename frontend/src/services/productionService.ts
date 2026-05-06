import authFetch, { buildQueryString } from '../utils/api';
import { ProductionPlan, PaginationData, ProductionPlanFilters } from '../types/production';

/**
 * 共通のエラーハンドリング関数
 */
const handleError = async (response: Response, defaultMessage: string) => {
    if (response.ok) return;
    let detail = '';
    try {
        const data = await response.json();
        detail = data.error || data.detail || '';
    } catch {
        detail = response.statusText;
    }
    throw new Error(detail || defaultMessage);
};

const productionService = {
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

    updateProgress: async (id: string, payload: {
        status: string;
        good_quantity?: number;
        actual_quantity?: number;
        defective_quantity?: number;
        remarks?: string;
    }) => {
        const response = await authFetch(`/api/production/plans/${id}/update-progress/`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        await handleError(response, 'Failed to update progress');
        return await response.json();
    },

    getRequiredParts: async (id: string) => {
        const response = await authFetch(`/api/production/plans/${id}/required-parts/`);
        await handleError(response, 'Failed to fetch required parts');
        return await response.json();
    },

    allocateMaterials: async (id: string, allocations: {
        part_number: string;
        warehouse: string;
        quantity_to_allocate: number;
    }[]) => {
        const response = await authFetch(`/api/production/plans/${id}/allocate-materials/`, {
            method: 'POST',
            body: JSON.stringify({ allocations })
        });
        await handleError(response, 'Allocation failed');
        return await response.json();
    }
};

export default productionService;
export type { ProductionPlan, PaginationData };
