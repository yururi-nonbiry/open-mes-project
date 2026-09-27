export interface ProductionPlan {
    id: string;
    plan_name: string;
    product_code: string;
    planned_quantity: number;
    planned_start_datetime: string;
    planned_end_datetime: string;
    actual_start_datetime: string | null;
    actual_end_datetime: string | null;
    status: string;
    status_display?: string;
    actual_quantity?: number;
    good_quantity?: number;
    defective_quantity?: number;
    remarks?: string;
    production_plan?: string;
    created_at?: string;
    updated_at?: string;
}

export interface PaginationData<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface ProductionPlanFilters {
    plan_name?: string;
    product_code?: string;
    planned_start_datetime_after?: string;
    planned_start_datetime_before?: string;
    status__in?: string;
    page_size?: number;
    ordering?: string;
}

export interface RequiredPartWarehouse {
    warehouse: string;
    /** この倉庫の引当可能数 */
    available_quantity: number;
}

/** 生産計画の所要部品と引当状況(plans/{id}/required-parts/) */
export interface RequiredPart {
    part_code: string;
    part_name: string;
    unit: string;
    /** 製品1個あたり所要数量(小数3桁の文字列) */
    quantity_per_unit: string;
    /** 計画全体の所要数量 */
    required_quantity: number;
    /** 所要量に対して引当済みの数量 */
    already_allocated_quantity: number;
    /** 所要量とは別に追加出庫した数量(歩留まり・ロス等) */
    additional_issued_quantity: number;
    /** 全倉庫の引当可能数の合計 */
    inventory_quantity: number;
    /** 引当可能な在庫がある倉庫(引当可能数の多い順)。倉庫は引当時に選ぶ */
    warehouses: RequiredPartWarehouse[];
}

/** 生産計画ごとの所要部品(計画作成時にBOMマスターからコピーされ、計画ごとに編集できる) */
export interface PlanMaterial {
    id?: string;
    production_plan: string;
    material_code: string;
    material_name?: string;
    material_unit?: string;
    quantity_per_unit: string | number;
    required_quantity?: number;
    remarks?: string | null;
}

export interface AdditionalIssueItem {
    part_number: string;
    warehouse: string;
    quantity: number;
}

export interface MaterialAllocationPayload {
    allocations: {
        part_number: string;
        warehouse: string;
        quantity_to_allocate: number;
    }[];
}

export interface ProgressUpdatePayload {
    status: string;
    good_quantity?: number;
    actual_quantity?: number;
    defective_quantity?: number;
    remarks?: string;
}

export interface UpdateProgressResponse {
    message: string;
    plan_id: string;
    new_status: string;
}

export interface AllocateMaterialsResponse {
    message: string;
    production_plan_id: string;
    allocations_summary: any[];
}

export const AVAILABLE_STATUSES = [
    { key: 'PENDING', label: '未着手', btnClass: 'btn-secondary', btnOutlineClass: 'btn-outline-secondary', default_selected: true },
    { key: 'IN_PROGRESS', label: '進行中', btnClass: 'btn-info', btnOutlineClass: 'btn-outline-info', default_selected: true },
    { key: 'COMPLETED', label: '完了', btnClass: 'btn-success', btnOutlineClass: 'btn-outline-success', default_selected: false },
    { key: 'ON_HOLD', label: '保留', btnClass: 'btn-warning', btnOutlineClass: 'btn-outline-warning', default_selected: true },
    { key: 'CANCELLED', label: '中止', btnClass: 'btn-danger', btnOutlineClass: 'btn-outline-danger', default_selected: false }
];

export const getDefaultSelectedStatuses = () => {
    return new Set(AVAILABLE_STATUSES.filter(s => s.default_selected).map(s => s.key));
};

export interface WorkProgress {
    id: string;
    production_plan: string;
    process_step: string;
    status: string;
    status_display?: string;
    quantity_completed: number;
    actual_reported_quantity: number | null;
    defective_reported_quantity: number | null;
    start_datetime: string | null;
    end_datetime: string | null;
}

export interface MaterialAllocation {
    id: string;
    production_plan: string;
    production_plan_name: string;
    material_code: string;
    allocated_quantity: number;
    allocation_datetime: string;
    status: 'ALLOCATED' | 'ISSUED' | 'RETURNED';
    status_display: string;
    /** NORMAL: 所要量に対する引当 / ADDITIONAL: 歩留まり・ロス等の追加出庫 */
    allocation_type?: 'NORMAL' | 'ADDITIONAL';
    allocation_type_display?: string;
    remarks: string | null;
    warehouse?: string;
}

export interface LimitingPart {
    part_code: string;
    part_name: string;
    warehouse: string | null;
    shortage_quantity: number;
}

export interface PartsSupplySimulationPlanResult {
    plan_id: string;
    plan_name: string;
    product_code: string | null;
    planned_start_datetime: string;
    planned_quantity: number;
    status: string;
    feasible: boolean;
    limiting_parts: LimitingPart[];
}

export interface PartsSupplySimulationPartResult {
    part_code: string;
    part_name: string;
    warehouse: string | null;
    available_quantity: number;
    total_required_quantity: number;
    shortage_quantity: number;
    shortage_plan_id: string | null;
    shortage_plan_name: string | null;
    shortage_date: string | null;
    lead_time_days: number;
    order_by_date: string | null;
    order_overdue: boolean;
}

export interface PartsSupplySimulationResult {
    plans: PartsSupplySimulationPlanResult[];
    parts: PartsSupplySimulationPartResult[];
}

