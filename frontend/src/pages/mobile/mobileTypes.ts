/** カメラスキャン結果を受け取る入力欄のセッター */
export type ScanTargetSetter = (value: string) => void;

/** モバイル画面共通のカメラスキャン状態 */
export interface CameraState {
    isOpen: boolean;
    targetSetter: ScanTargetSetter | null;
    /**
     * search: 検索欄用。QRコードアクションに一致すれば実行し、なければ読み取った値で検索する。
     * field: フォームの入力欄用(倉庫・棚番など)。QRコードアクションは実行せず、読み取った値をそのまま入れる
     * (アクションを実行すると、入力欄ではなく背面の一覧の検索語が書き換わってしまうため)。
     */
    mode?: 'search' | 'field';
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
    /** 移動先の倉庫。棚番QR({"warehouse","shelf"})で別の倉庫の棚を読んだときに設定する(空は移動元と同じ倉庫) */
    targetWarehouse?: string;
    purposeQuantity: string;
    purposeTo: string;
    purposeReason: string;
    message: MobileMessage;
}
