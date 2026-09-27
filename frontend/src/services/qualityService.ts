import { apiRequest } from '../utils/api';

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
        const data = await apiRequest('/api/quality/inspection-items/', {}, 'Failed to fetch inspection items');
        return data.data as InspectionItem[];
    },

    getInspectionItem: async (id: string) => {
        const data = await apiRequest(`/api/quality/inspection-items/${id}/`, {}, 'Failed to fetch inspection item');
        return data.data as InspectionItem;
    },

    createInspectionItem: (item: InspectionItem) =>
        apiRequest('/api/quality/inspection-items/', { method: 'POST', body: JSON.stringify(item) }, 'Failed to create item'),

    updateInspectionItem: (id: string, item: InspectionItem) =>
        apiRequest(`/api/quality/inspection-items/${id}/`, { method: 'PUT', body: JSON.stringify(item) }, 'Failed to update item'),

    deleteInspectionItem: (id: string) =>
        apiRequest(`/api/quality/inspection-items/${id}/`, { method: 'DELETE' }, 'Failed to delete item'),

    getInspectionFormData: (id: string | number) =>
        apiRequest(`/api/quality/inspection-items/${id}/form-data/`, {}, 'Failed to fetch inspection form data'),

    recordInspectionResult: (id: string | number, formData: FormData) =>
        apiRequest(
            `/api/quality/inspection-items/${id}/record-result/`,
            { method: 'POST', body: formData },
            'Failed to record inspection result'
        ),
};

export default qualityService;
