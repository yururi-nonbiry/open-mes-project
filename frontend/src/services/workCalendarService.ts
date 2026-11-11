import { apiRequest } from '../utils/api';

export interface WorkCalendarSetting {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
}

export interface WorkCalendarDay {
    id?: number;
    date: string; // YYYY-MM-DD
    is_workday: boolean;
    note: string;
}

const workCalendarService = {
    getSetting: async () => {
        const data = await apiRequest('/api/master/work-calendar-settings/', {}, '稼働曜日の取得に失敗しました。');
        return data.data as WorkCalendarSetting;
    },

    saveSetting: (setting: WorkCalendarSetting) =>
        apiRequest(
            '/api/master/work-calendar-settings/',
            { method: 'PUT', body: JSON.stringify(setting) },
            '稼働曜日の保存に失敗しました。',
        ),

    getDays: async (from: string, to: string) => {
        const data = await apiRequest(
            `/api/master/work-calendar-days/?from=${from}&to=${to}`,
            {},
            '例外日の取得に失敗しました。',
        );
        return (data.data || []) as WorkCalendarDay[];
    },

    saveDay: (day: WorkCalendarDay) => {
        const url = day.id ? `/api/master/work-calendar-days/${day.id}/` : '/api/master/work-calendar-days/';
        return apiRequest(url, { method: day.id ? 'PUT' : 'POST', body: JSON.stringify(day) }, '例外日の保存に失敗しました。');
    },

    deleteDay: (id: number) =>
        apiRequest(`/api/master/work-calendar-days/${id}/`, { method: 'DELETE' }, '例外日の削除に失敗しました。'),
};

export default workCalendarService;
