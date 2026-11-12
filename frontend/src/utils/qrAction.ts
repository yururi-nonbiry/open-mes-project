import authFetch, { handleError } from './api';
import type { QrActionResponse } from '../pages/mobile/mobileTypes';

/**
 * 入力欄の値(ハンディQRリーダーの読取結果など)でQRコードアクションを実行する。
 * 一致するアクションがない場合は null を返す(呼び出し側で通常の検索として扱う)。
 */
export const executeQrAction = async <TPayload = Record<string, unknown>>(
    qrData: string
): Promise<QrActionResponse<TPayload>['result'] | null> => {
    const response = await authFetch('/api/base/qr-code-actions/execute/', {
        method: 'POST',
        body: JSON.stringify({ qr_data: qrData }),
    });
    if (response.status === 404) return null;
    await handleError(response, `サーバーエラー: ${response.status}`);
    const data: QrActionResponse<TPayload> = await response.json();
    return data.result ?? null;
};
