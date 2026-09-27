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
    /** 中間品の子計画の場合、その中間品を使う親の生産計画 */
    parent_plan?: string | null;
    parent_plan_name?: string | null;
    child_plan_count?: number;
    /** 在庫で足りるが、子計画を立てるか在庫を使うかが未決定の中間品の数 */
    pending_intermediate_count?: number;
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
    material_item_type?: string;
    supply_method?: SupplyMethod;
    supply_method_display?: string;
    remarks?: string | null;
}

/** 中間品の手配方法('' は未決定) */
export type SupplyMethod = '' | 'STOCK' | 'CHILD_PLAN';

export interface IntermediateChildPlan {
    id: string;
    plan_name: string;
    planned_quantity: number;
    planned_start_datetime: string;
    planned_end_datetime: string;
    status: string;
    status_display: string;
}

/** 生産計画の中間品ごとの手配状況(plans/{id}/intermediate-requirements/) */
export interface IntermediateRequirement {
    material_code: string;
    material_name: string;
    unit: string | null;
    required_quantity: number;
    allocated_quantity: number;
    /** この計画の子計画(未着手・進行中)で作る数量 */
    child_planned_quantity: number;
    /** 計画開始時点で使える見込み数(未引当の在庫 + 開始までの他の生産予定 - 先に始まる計画の未引当の所要数) */
    projected_available_quantity: number;
    /** 引当・子計画でまだ賄えていない数量 */
    uncovered_quantity: number;
    /** 見込みを使っても足りない数量 */
    shortage_quantity: number;
    supply_method: SupplyMethod;
    supply_method_display: string;
    /** SHORTAGE: 不足 / DECISION_REQUIRED: 子計画か在庫かを選ぶ / COVERED: 手配済み */
    status: 'SHORTAGE' | 'DECISION_REQUIRED' | 'COVERED';
    child_plans: IntermediateChildPlan[];
}

export interface IntermediateDecision {
    material_code: string;
    method: 'CHILD_PLAN' | 'STOCK';
    quantity?: number;
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
    /** 入荷見込みに数えた生産予定(中間品の生産計画)の合計数量 */
    incoming_quantity: number;
    incoming_plans: IncomingPlan[];
}

/** 部品供給シミュレーションで入荷見込みに数えた生産計画 */
export interface IncomingPlan {
    plan_id: string;
    plan_name: string;
    quantity: number;
    planned_end_datetime: string;
    /** 生産する計画自身がシミュレーション内で部品不足 */
    at_risk: boolean;
}

export interface PartsSupplySimulationResult {
    plans: PartsSupplySimulationPlanResult[];
    parts: PartsSupplySimulationPartResult[];
}

