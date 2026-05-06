import authFetch from '../utils/api';

export interface ProductionPlan {
    id: number;
    plan_name: string;
    product_code: string;
    planned_quantity: number;
    planned_start_datetime: string;
    status: string;
    status_display?: string;
    actual_quantity?: number;
    good_quantity?: number;
    defective_quantity?: number;
}

export interface PaginationData<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

const productionService = {
    getProductionPlans: async (params: URLSearchParams) => {
        const response = await authFetch(`/api/production/plans/?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch production plans');
        return await response.json() as PaginationData<ProductionPlan>;
    },

    updateProgress: async (id: number, payload: Record<string, any>) => {
        const response = await authFetch(`/api/production/plans/${id}/update-progress/`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || data.detail || 'Failed to update progress');
        }
        return await response.json();
    },

    getRequiredParts: async (id: number) => {
        const response = await authFetch(`/api/production/plans/${id}/required-parts/`);
        if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(data?.detail || response.statusText || `Server Error (${response.status})`);
        }
        return await response.json();
    },

    allocateMaterials: async (id: number, allocations: any[]) => {
        const response = await authFetch(`/api/production/plans/${id}/allocate-materials/`, {
            method: 'POST',
            body: JSON.stringify({ allocations })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.detail || 'Allocation failed');
        return data;
    }
};

export default productionService;
