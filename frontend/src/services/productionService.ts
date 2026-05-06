import authFetch from '../utils/api';
import { ProductionPlan, PaginationData, ProductionPlanFilters } from '../types/production';

const productionService = {
    getProductionPlans: async (filters: ProductionPlanFilters = {}) => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                params.append(key, value.toString());
            }
        });
        
        const response = await authFetch(`/api/production/plans/?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch production plans');
        return await response.json() as PaginationData<ProductionPlan>;
    },

    getProductionPlansByUrl: async (url: string) => {
        const response = await authFetch(url);
        if (!response.ok) throw new Error('Failed to fetch production plans');
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
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || data.detail || 'Failed to update progress');
        }
        return await response.json();
    },

    getRequiredParts: async (id: string) => {
        const response = await authFetch(`/api/production/plans/${id}/required-parts/`);
        if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(data?.detail || response.statusText || `Server Error (${response.status})`);
        }
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
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.detail || 'Allocation failed');
        return data;
    }
};

export default productionService;
export type { ProductionPlan, PaginationData };
