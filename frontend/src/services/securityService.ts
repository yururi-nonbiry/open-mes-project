import authFetch, { apiRequest, buildQueryString, handleError } from '../utils/api';

export interface AccessLog {
    id: number;
    created_at: string;
    event_type: string;
    event_type_display: string;
    user: string | null;
    username: string;
    ip_address: string | null;
    user_agent: string;
    method: string;
    path: string;
    status_code: number | null;
    detail: Record<string, unknown>;
}

export interface AccessLogPage {
    count: number;
    next: string | null;
    previous: string | null;
    total_pages: number;
    current_page: number;
    results: AccessLog[];
    event_types: { value: string; label: string }[];
}

export interface AccessLogFilters {
    event_type?: string;
    username?: string;
    ip_address?: string;
    date_from?: string;
    date_to?: string;
}

export interface AccountLockStatus {
    id: number;
    user_id: string;
    custom_id: string;
    username: string;
    failure_count: number;
    lock_level: number;
    locked_until: string | null;
    requires_admin_unlock: boolean;
    is_locked: boolean;
    last_failure_at: string | null;
}

export interface IpBlockStatus {
    id: number;
    ip_address: string;
    blocked_until: string;
    failure_count: number;
    created_at: string;
}

export interface Captcha {
    key: string;
    /** PNG画像の data URL */
    image: string;
}

const securityService = {
    getAccessLogs: (filters: AccessLogFilters, page = 1) =>
        apiRequest<AccessLogPage>(
            `/api/security/access-logs/${buildQueryString({ ...filters, page })}`,
            {},
            'アクセスログの取得に失敗しました。'
        ),

    /** 絞り込み条件に合うアクセスログをCSVでダウンロードする */
    exportAccessLogs: async (filters: AccessLogFilters) => {
        const response = await authFetch(`/api/security/access-logs/export/${buildQueryString({ ...filters })}`);
        await handleError(response, 'アクセスログのCSV出力に失敗しました。');
        const disposition = response.headers.get('Content-Disposition') || '';
        const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || 'access_logs.csv';
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    },

    getLocks: () =>
        apiRequest<{ users: AccountLockStatus[]; ips: IpBlockStatus[] }>(
            '/api/security/locks/',
            {},
            'ロック状況の取得に失敗しました。'
        ),

    unlockUser: (userId: string) =>
        apiRequest<{ message: string }>(
            `/api/security/locks/users/${userId}/unlock/`,
            { method: 'POST' },
            'ロックの解除に失敗しました。'
        ),

    unblockIp: (id: number) =>
        apiRequest<{ message: string }>(
            `/api/security/locks/ips/${id}/unblock/`,
            { method: 'POST' },
            'ブロックの解除に失敗しました。'
        ),

    /** ログイン画面用。未ログインで呼ぶため authFetch は使わない */
    getCaptcha: async (): Promise<Captcha> => {
        const response = await fetch('/api/security/captcha/');
        await handleError(response, '画像認証の取得に失敗しました。');
        return response.json();
    },
};

export default securityService;
