/** カメラスキャン結果を受け取る入力欄のセッター */
export type ScanTargetSetter = (value: string) => void;

/** モバイル画面共通のカメラスキャン状態 */
export interface CameraState {
    isOpen: boolean;
    targetSetter: ScanTargetSetter | null;
}

/** 画面に表示するメッセージ(type: 'success' | 'error' | 'danger' など) */
export interface MobileMessage {
    text: string;
    type: string;
}

/**
 * QRコードアクション実行APIのレスポンス。
 * バックエンドが実行するのは「検索欄に入力」(update_search)のみで、抜き出した文字列を updateSearch で返す。
 */
export interface QrActionResponse {
    result?: {
        action?: string;
        updateSearch?: string;
    };
}

/** catch した値からメッセージ文字列を取り出す */
export const errorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : String(err);

/** 棚番別在庫(by-location API)の1行 */
export interface LocationInventoryItem {
    id: string | number;
    part_number: string;
    purpose?: string | null;
    quantity: number;
    reserved: number;
    available_quantity: number;
}

/** 棚番移動モーダルの状態 */
export interface TransferModalState {
    isOpen: boolean;
    step: 'selection' | 'transfer' | 'purpose';
    items: LocationInventoryItem[];
    selectedItem: LocationInventoryItem | null;
    transferQuantity: string;
    targetLocation: string;
    purposeQuantity: string;
    purposeTo: string;
    purposeReason: string;
    message: MobileMessage;
}
