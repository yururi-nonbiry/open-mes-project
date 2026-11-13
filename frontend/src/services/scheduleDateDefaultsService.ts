import authFetch, { apiRequest } from '../utils/api';

/** 入庫・出庫の予定日フィルタ初期値(今日からの相対日数)。null は指定なし。 */
export interface ScheduleDateOffsets {
    schedule_date_from_offset_days: number | null;
    schedule_date_to_offset_days: number | null;
}

/** 画面の初期値として使う日付(YYYY-MM-DD。指定なしは空文字)。 */
export interface ScheduleDateDefaults {
    from: string;
    to: string;
}

const NO_OFFSETS: ScheduleDateOffsets = {
    schedule_date_from_offset_days: null,
    schedule_date_to_offset_days: null,
};

const formatLocalDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** 今日(ローカル日付)から days 日ずらした日付。null は指定なし(空文字)。 */
export const offsetToDate = (days: number | null, base: Date = new Date()): string => {
    if (days === null || days === undefined) return '';
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
    return formatLocalDate(d);
};

export const offsetsToDefaults = (offsets: ScheduleDateOffsets, base: Date = new Date()): ScheduleDateDefaults => ({
    from: offsetToDate(offsets.schedule_date_from_offset_days, base),
    to: offsetToDate(offsets.schedule_date_to_offset_days, base),
});

const scheduleDateDefaultsService = {
    /** 設定値(相対日数)の取得。取得に失敗した場合は指定なし(絞り込まない)側に倒す。 */
    getOffsets: async (): Promise<ScheduleDateOffsets> => {
        try {
            const response = await authFetch('/api/base/schedule-date-defaults/');
            if (!response.ok) return NO_OFFSETS;
            return await response.json() as ScheduleDateOffsets;
        } catch (_err) {
            return NO_OFFSETS;
        }
    },

    /** 設定値の更新(管理者のみ)。失敗時は ApiError を送出する。 */
    updateOffsets: (payload: Partial<ScheduleDateOffsets>) =>
        apiRequest<ScheduleDateOffsets>(
            '/api/base/schedule-date-defaults/',
            { method: 'PUT', body: JSON.stringify(payload) },
            '設定の保存に失敗しました。'
        ),

    /** 画面を開いた日を基準にした初期値。 */
    getDefaults: async (): Promise<ScheduleDateDefaults> =>
        offsetsToDefaults(await scheduleDateDefaultsService.getOffsets()),
};

export default scheduleDateDefaultsService;
