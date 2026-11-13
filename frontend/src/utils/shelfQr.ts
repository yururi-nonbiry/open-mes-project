/**
 * 倉庫棚番QR作成画面(ShelfQrCodeCreation)が発行するQRの中身: {"warehouse":"倉庫","shelf":"棚番"}
 * カメラやバーコードリーダーで読み取った文字列がこの形式なら倉庫と棚番に分解する。
 * この形式でなければ null(通常の文字列として扱う)。
 */
export interface ShelfQr {
    warehouse: string;
    shelf: string;
}

export const parseShelfQr = (text: string): ShelfQr | null => {
    const trimmed = (text || '').trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object') return null;
        const { warehouse, shelf } = parsed as Record<string, unknown>;
        if (typeof shelf !== 'string' || !shelf.trim()) return null;
        return { warehouse: typeof warehouse === 'string' ? warehouse.trim() : '', shelf: shelf.trim() };
    } catch {
        return null;
    }
};

/**
 * フォーム状態に入力値を反映する。棚番QRなら(棚番欄・倉庫欄のどちらに入力されても)棚番欄に棚番、倉庫欄に倉庫を設定し
 * (倉庫が空のQRでは倉庫は変えない)、それ以外は通常どおり指定の欄に値を設定する。
 */
export const applyShelfInput = <T extends object>(
    prev: T,
    field: string,
    value: string,
    locationField: string,
    warehouseField?: string
): T => {
    const isShelfTarget = field === locationField || (warehouseField !== undefined && field === warehouseField);
    const shelf = isShelfTarget ? parseShelfQr(value) : null;
    if (!shelf) return { ...prev, [field]: value };
    const next = { ...prev, [locationField]: shelf.shelf } as Record<string, unknown>;
    if (warehouseField && shelf.warehouse) next[warehouseField] = shelf.warehouse;
    return next as T;
};
