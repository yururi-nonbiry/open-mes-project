
import type { RequiredPart, RequiredPartWarehouse } from '../../types/production';

/** 進捗ステータスの選択肢(AVAILABLE_STATUSES の要素) */
export interface StatusOption {
    key: string;
    label: string;
    btnClass: string;
    btnOutlineClass: string;
    default_selected: boolean;
}

/** 引当結果の明細行 */
export interface AllocationSummaryItem {
    part_number: string;
    allocated_quantity: number | string;
    status: string;
}

/** 引当APIの応答(表示に使う項目のみ) */
export interface AllocationResultData {
    message?: string;
    allocations_summary?: AllocationSummaryItem[];
}

/** 旧形式の応答(inventories / allocated_quantity)も許容した所要部品 */
export type RawRequiredPart = Omit<RequiredPart, 'warehouses' | 'already_allocated_quantity'> & {
    warehouses?: RequiredPartWarehouse[];
    inventories?: RequiredPartWarehouse[];
    already_allocated_quantity?: number;
    allocated_quantity?: number;
};

/** 配列、または配列を1つのキーに包んだオブジェクトのどちらでも返りうる応答 */
export type MaybeWrapped<K extends string, T> = T[] | { [P in K]?: T[] };

/** MaybeWrapped から配列を取り出す(どちらでもなければ空配列) */
export function unwrapList<K extends string, T>(raw: MaybeWrapped<K, T>, key: K): T[] {
    if (Array.isArray(raw)) return raw;
    const inner = (raw as { [P in K]?: T[] } | null | undefined)?.[key];
    return Array.isArray(inner) ? inner : [];
}

