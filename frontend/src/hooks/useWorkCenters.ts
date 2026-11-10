import { useEffect, useState } from 'react';
import workCenterService, { WorkCenter } from '../services/workCenterService';

/** 出庫先ラインの選択肢(ワークセンター)。取得に失敗した場合は空(=ライン未指定のみ)にする。 */
export const useWorkCenters = () => {
    const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
    useEffect(() => {
        workCenterService.getWorkCenters().then(setWorkCenters).catch(() => setWorkCenters([]));
    }, []);
    return workCenters;
};
