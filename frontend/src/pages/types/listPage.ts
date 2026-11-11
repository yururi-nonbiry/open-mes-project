// 一覧系画面(入庫・出庫・入出庫履歴・出庫予定)で共有する型

/** モデル項目表示設定(/api/base/model-display-settings/)の1行。既定列は一部の項目のみ持つ */
export interface DisplaySetting {
  id?: number | string;
  data_type?: string;
  model_field_name: string;
  verbose_name?: string;
  display_name?: string | null;
  field_type?: string;
  is_list_display?: boolean;
  display_order?: number;
  is_search_field?: boolean;
  search_order?: number;
}

/** モデル項目(/api/base/model-fields/)の1行 */
export interface ModelFieldInfo {
  name: string;
  verbose_name: string;
  field_type?: string;
}

/** 一覧セルに表示できる値(React がそのまま描画できる範囲) */
export type CellValue = string | number | boolean | null | undefined;

/** 発注(入庫予定)の1行 */
export interface PurchaseOrderRow {
  id: string;
  order_number?: string;
  item?: string | null;
  part_number?: string | null;
  item_default_location?: string | null;
  quantity?: number | null;
  received_quantity?: number | null;
  warehouse?: string | null;
  location?: string | null;
  purpose?: string | null;
  status: string;
  supplier?: string | null;
  product_name?: string | null;
  delivery_date?: string | null;
  delivered_quantity?: number | null;
  [key: string]: CellValue;
}

/** 入出庫履歴の1行 */
export interface StockMovementRow {
  id: string | number;
  [key: string]: CellValue;
}

/** 検索条件の値(文字列、または入出庫種別の選択集合) */
export type SearchParamValue = string | Set<string>;
