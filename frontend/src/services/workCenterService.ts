import { apiRequest } from '../utils/api';

export interface WorkCenter {
    id?: string;
    code: string;
    name: string;
}

const workCenterService = {
    /** ライン(ワークセンター)一覧。出庫先ラインの選択肢に使う。 */
    getWorkCenters: async () => {
        const data = await apiRequest('/api/master/work-centers/', {}, 'ライン一覧の取得に失敗しました。');
        const list = Array.isArray(data) ? data : data?.data ?? data?.results ?? [];
        return list as WorkCenter[];
    },
};

export default workCenterService;
