/**
 * 一覧画面(入庫・出庫・在庫照会・入出庫履歴)の既定の列。
 * 表示設定が未登録の場合に一覧画面で使い、ページ項目表示設定では「初めて設定するときに表示ONにする列」として使う
 * (既定の列以外の項目は表示OFFで始める。全項目を表示ONにすると不要な列まで一覧に出てしまうため)。
 */
export interface DefaultColumn {
    model_field_name: string;
    verbose_name: string;
}

export const GOODS_RECEIPT_DEFAULT_COLUMNS: DefaultColumn[] = [
    { model_field_name: 'order_number', verbose_name: '発注番号' },
    { model_field_name: 'supplier', verbose_name: '仕入先' },
    { model_field_name: 'item', verbose_name: '品番・品目' },
    { model_field_name: 'product_name', verbose_name: '品名' },
    { model_field_name: 'warehouse', verbose_name: '入庫倉庫' },
    { model_field_name: 'location', verbose_name: '棚番' },
    { model_field_name: 'quantity', verbose_name: '発注数' },
    { model_field_name: 'received_quantity', verbose_name: '入庫済' },
    { model_field_name: 'remaining_quantity', verbose_name: '未入庫残' },
    { model_field_name: 'expected_arrival', verbose_name: '入荷予定日' },
    { model_field_name: 'status', verbose_name: '状態' },
];

export const GOODS_ISSUE_DEFAULT_COLUMNS: DefaultColumn[] = [
    { model_field_name: 'order_number', verbose_name: '受注番号' },
    { model_field_name: 'item', verbose_name: '品目（品番）' },
    { model_field_name: 'warehouse', verbose_name: '出庫倉庫' },
    { model_field_name: 'purpose', verbose_name: '用途' },
    { model_field_name: 'line', verbose_name: '出庫先ライン' },
    { model_field_name: 'quantity', verbose_name: '予定数量' },
    { model_field_name: 'shipped_quantity', verbose_name: '出庫済' },
    { model_field_name: 'remaining_quantity', verbose_name: '未出庫残' },
    { model_field_name: 'expected_shipment', verbose_name: '出庫予定日' },
];

export const INVENTORY_DEFAULT_COLUMNS: DefaultColumn[] = [
    { model_field_name: 'part_number', verbose_name: '品番' },
    { model_field_name: 'warehouse', verbose_name: '倉庫' },
    { model_field_name: 'location', verbose_name: '棚番（ロケーション）' },
    { model_field_name: 'purpose', verbose_name: '用途' },
    { model_field_name: 'quantity', verbose_name: '現在庫数' },
    { model_field_name: 'reserved', verbose_name: '引当済' },
    { model_field_name: 'available_quantity', verbose_name: '利用可能数' },
    { model_field_name: 'last_updated', verbose_name: '最終更新日時' },
];

export const STOCK_MOVEMENT_DEFAULT_COLUMNS: DefaultColumn[] = [
    { model_field_name: 'movement_date', verbose_name: '移動日時' },
    { model_field_name: 'part_number', verbose_name: '品番' },
    { model_field_name: 'warehouse', verbose_name: '倉庫' },
    { model_field_name: 'movement_type', verbose_name: '移動種別' },
    { model_field_name: 'quantity', verbose_name: '数量' },
    { model_field_name: 'operator', verbose_name: '記録者' },
    { model_field_name: 'description', verbose_name: '内容・備考' },
    { model_field_name: 'reference_document', verbose_name: '参照伝票・計画' },
];
