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
