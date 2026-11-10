import { apiRequest } from '../utils/api';

export interface StockPurpose {
    id?: string;
    code: string;
    name: string;
    is_active: boolean;
}

const stockPurposeService = {
    /** 用途一覧。activeOnly=true で有効な用途のみ(入庫画面の選択肢用)。 */
    getPurposes: async (activeOnly = false) => {
        const data = await apiRequest('/api/master/stock-purposes/', {}, '用途一覧の取得に失敗しました。');
        const list = (data.data || []) as StockPurpose[];
        return activeOnly ? list.filter(p => p.is_active) : list;
    },

    savePurpose: (purpose: StockPurpose) => {
        const url = purpose.id ? `/api/master/stock-purposes/${purpose.id}/` : '/api/master/stock-purposes/';
        const method = purpose.id ? 'PUT' : 'POST';
        return apiRequest(url, { method, body: JSON.stringify(purpose) }, '用途の保存に失敗しました。');
    },

    deletePurpose: (id: string) =>
        apiRequest(`/api/master/stock-purposes/${id}/`, { method: 'DELETE' }, '用途の削除に失敗しました。'),
};

export default stockPurposeService;
