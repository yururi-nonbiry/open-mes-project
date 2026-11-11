import type { ChangeEvent } from 'react';

/** model-fields API の1項目 */
export interface ModelFieldInfo {
    name: string;
    verbose_name: string;
    help_text: string;
    is_required?: boolean;
    default_value?: unknown;
}

/** model-display-settings API の1項目 */
export interface ModelDisplaySettingRecord {
    model_field_name: string;
    verbose_name?: string;
    display_name?: string;
    display_order?: number;
    search_order?: number;
    is_list_display?: boolean;
    is_search_field?: boolean;
    is_list_filter?: boolean;
}

/** csv-mappings API の1項目 */
export interface CsvMappingRecord {
    model_field_name: string;
    csv_header?: string;
    order?: number;
    is_update_key: boolean;
}

/** bulk-save API のレスポンス */
export interface BulkSaveResult {
    message: string;
}

/** 設定画面の保存結果表示 */
export interface SaveStatus {
    message: string;
    variant: string;
    show: boolean;
}

/** 入力変更ハンドラが受け取るイベント */
export type FieldChangeEvent = ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;

/** モデル項目表示設定の編集行 */
export interface ModelDisplayRow {
    model_field_name: string;
    verbose_name: string;
    display_name: string;
    help_text: string;
    display_order: number;
    is_list_display: boolean;
    is_search_field: boolean;
    is_list_filter: boolean;
}

/** ページ項目表示設定の編集行 */
export interface PageDisplayRow extends ModelDisplayRow {
    source_data_type: string;
    search_order: number;
}

/** CSVマッピング設定の編集行 */
export interface CsvMappingRow {
    model_field_name: string;
    verbose_name: string;
    is_model_required?: boolean;
    default_value?: unknown;
    help_text: string;
    csv_header: string;
    custom_display_name: string;
    order: number;
    is_update_key: boolean;
    is_active: boolean;
}
