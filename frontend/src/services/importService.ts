import authFetch, { handleError } from '../utils/api';

const importService = {
    getList: async (url: string) => {
        const response = await authFetch(url);
        await handleError(response, 'Failed to fetch list data');
        return await response.json();
    },

    getDetail: async (url: string) => {
        const response = await authFetch(url);
        await handleError(response, 'Failed to fetch record details');
        return await response.json();
    },

    saveRecord: async (url: string, method: 'POST' | 'PUT', data: Record<string, any>) => {
        const response = await authFetch(url, {
            method,
            body: JSON.stringify(data),
        });
        await handleError(response, 'Failed to save record');
        return await response.json();
    },

    deleteRecord: async (url: string) => {
        const response = await authFetch(url, { method: 'DELETE' });
        await handleError(response, 'Failed to delete record');
        return true;
    },

    importCsv: async (file: File, dataType: string) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('data_type', dataType);

        const response = await authFetch('/api/base/csv-import/', {
            method: 'POST',
            body: formData,
        });
        await handleError(response, 'Failed to upload CSV');
        return await response.json();
    },

    getTaskStatus: async (taskId: string) => {
        const response = await authFetch(`/api/base/async-tasks/${taskId}/`);
        await handleError(response, 'Failed to fetch task status');
        return await response.json();
    }
};

export default importService;
