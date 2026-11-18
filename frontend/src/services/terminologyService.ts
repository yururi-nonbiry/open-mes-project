import authFetch, { apiRequest } from '../utils/api';
import { TERM_DEFAULTS, Terms } from '../utils/terms';

const terminologyService = {
    /** 用語設定の取得。失敗した場合は既定の呼び方に倒す。 */
    get: async (): Promise<Terms> => {
        try {
            const response = await authFetch('/api/base/terminology/');
            if (!response.ok) return { ...TERM_DEFAULTS };
            return { ...TERM_DEFAULTS, ...(await response.json() as Partial<Terms>) };
        } catch (_err) {
            return { ...TERM_DEFAULTS };
        }
    },

    /** 用語設定の更新(管理者のみ)。失敗時は ApiError を送出する。 */
    update: (payload: Partial<Terms>) =>
        apiRequest<Terms>(
            '/api/base/terminology/',
            { method: 'PUT', body: JSON.stringify(payload) },
            '用語設定の保存に失敗しました。'
        ),
};

export default terminologyService;
