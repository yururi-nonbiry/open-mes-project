import authFetch from '../utils/api';

/**
 * バックエンドのエラーレスポンスから可能な限り具体的なメッセージを抽出する。
 * - CustomSuccessMessageMixin系: { status: "error", message: "..." }
 * - DRFのシリアライザバリデーションエラー: { field_name: ["エラー内容", ...], ... }
 * - その他: { error: "..." } / { detail: "..." }
 */
const extractErrorMessage = async (response: Response, defaultMessage: string): Promise<string> => {
    try {
        const data = await response.json();
        if (typeof data?.message === 'string') return data.message;
        if (typeof data?.error === 'string') return data.error;
        if (typeof data?.detail === 'string') return data.detail;
        if (data && typeof data === 'object') {
            const parts = Object.entries(data).map(([field, messages]) => {
                const msg = Array.isArray(messages) ? messages.join(' ') : String(messages);
                return `${field}: ${msg}`;
            });
            if (parts.length > 0) return parts.join(' / ');
        }
    } catch {
        // JSON以外のレスポンス（HTMLエラーページ等）は無視してデフォルトメッセージを使う
    }
    return defaultMessage;
};

const importService = {
    getList: async (url: string) => {
        const response = await authFetch(url);
        if (!response.ok) throw new Error(await extractErrorMessage(response, 'Failed to fetch list data'));
        return await response.json();
    },

    getDetail: async (url: string) => {
        const response = await authFetch(url);
        if (!response.ok) throw new Error(await extractErrorMessage(response, 'Failed to fetch record details'));
        return await response.json();
    },

    saveRecord: async (url: string, method: 'POST' | 'PUT', data: Record<string, any>) => {
        const response = await authFetch(url, {
            method,
            body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error(await extractErrorMessage(response, 'Failed to save record'));
        return await response.json();
    },

    deleteRecord: async (url: string) => {
        const response = await authFetch(url, { method: 'DELETE' });
        if (!response.ok) throw new Error(await extractErrorMessage(response, 'Failed to delete record'));
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
        if (!response.ok) throw new Error(await extractErrorMessage(response, 'Failed to upload CSV'));
        return await response.json();
    },

    getTaskStatus: async (taskId: string) => {
        const response = await authFetch(`/api/base/async-tasks/${taskId}/`);
        if (!response.ok) throw new Error(await extractErrorMessage(response, 'Failed to fetch task status'));
        return await response.json();
    }
};

export default importService;
