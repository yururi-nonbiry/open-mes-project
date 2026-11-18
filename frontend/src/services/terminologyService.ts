import authFetch, { apiRequest } from '../utils/api';
import { PART_TERM_DEFAULT } from '../utils/terms';

export interface Terminology {
    part: string;
}

const terminologyService = {
    /** 用語設定の取得。失敗した場合は既定の呼び方に倒す。 */
    get: async (): Promise<Terminology> => {
        try {
            const response = await authFetch('/api/base/terminology/');
            if (!response.ok) return { part: PART_TERM_DEFAULT };
            return await response.json() as Terminology;
        } catch (_err) {
            return { part: PART_TERM_DEFAULT };
        }
    },

    /** 用語設定の更新(管理者のみ)。失敗時は ApiError を送出する。 */
    update: (payload: Terminology) =>
        apiRequest<Terminology>(
            '/api/base/terminology/',
            { method: 'PUT', body: JSON.stringify(payload) },
            '用語設定の保存に失敗しました。'
        ),
};

export default terminologyService;
