import { useEffect, useState } from 'react';
import scheduleDateDefaultsService, { ScheduleDateDefaults } from '../services/scheduleDateDefaultsService';

/**
 * 入庫・出庫の予定日フィルタ初期値(管理者設定)を取得する。
 * 取得が終わるまで null を返すので、画面は null の間は描画を待ち、初期値で1回だけ検索する。
 */
export const useScheduleDateDefaults = (): ScheduleDateDefaults | null => {
    const [defaults, setDefaults] = useState<ScheduleDateDefaults | null>(null);
    useEffect(() => {
        let active = true;
        scheduleDateDefaultsService.getDefaults().then(d => { if (active) setDefaults(d); });
        return () => { active = false; };
    }, []);
    return defaults;
};
