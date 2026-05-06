import authFetch from '../utils/api';

export interface MeasurementDetail {
    id?: string | null;
    name: string;
    measurement_type: 'quantitative' | 'qualitative';
    specification_nominal?: number | null;
    specification_upper_limit?: number | null;
    specification_lower_limit?: number | null;
    specification_unit?: string;
    expected_qualitative_result?: string;
    order?: number;
}

export interface InspectionItem {
    id?: string;
    code: string;
    name: string;
    description?: string;
    inspection_type: string;
    inspection_type_display?: string;
    target_object_type: string;
    target_object_type_display?: string;
    is_active: boolean;
    measurement_details?: MeasurementDetail[];
}

const qualityService = {
    getInspectionItems: async () => {
        const response = await authFetch('/api/quality/inspection-items/');
        if (!response.ok) throw new Error('Failed to fetch inspection items');
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.message || 'Failed to fetch inspection items');
        return data.data as InspectionItem[];
    },

    getInspectionItem: async (id: string) => {
        const response = await authFetch(`/api/quality/inspection-items/${id}/`);
        if (!response.ok) throw new Error('Failed to fetch inspection item');
        const data = await response.json();
        if (data.status !== 'success') throw new Error(data.message || 'Failed to fetch inspection item');
        return data.data as InspectionItem;
    },

    createInspectionItem: async (item: InspectionItem) => {
        const response = await authFetch('/api/quality/inspection-items/', {
            method: 'POST',
            body: JSON.stringify(item),
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw { message: data.message || 'Failed to create item', data: data.data || data };
        }
        return data;
    },

    updateInspectionItem: async (id: string, item: InspectionItem) => {
        const response = await authFetch(`/api/quality/inspection-items/${id}/`, {
            method: 'PUT',
            body: JSON.stringify(item),
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw { message: data.message || 'Failed to update item', data: data.data || data };
        }
        return data;
    },

    deleteInspectionItem: async (id: string) => {
        const response = await authFetch(`/api/quality/inspection-items/${id}/`, {
            method: 'DELETE',
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
            throw new Error(data.message || 'Failed to delete item');
        }
        return data;
    }
};

export default qualityService;
