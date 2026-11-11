export type FormValue = string | number | boolean | null | undefined;
export type FormDataRecord = Record<string, FormValue>;
export type RowValue = string | number | boolean | null | undefined;
export type RowRecord = Record<string, RowValue>;

export interface ImportModalConfig {
    type: string;
    name?: string;
    recordId?: string | number | null;
}

export interface ImportListData {
    headers: string[];
    rows: RowRecord[];
    rowKeys: string[];
    idKey: string;
}

export interface DeleteTarget extends RowRecord {
    displayName?: string;
}

export interface ImportCsvResult {
    message: string;
    isError: boolean;
    errors: string[];
}
