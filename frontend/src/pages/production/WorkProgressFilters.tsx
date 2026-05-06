import React from 'react';

interface WorkProgressFiltersProps {
    filters: {
        plan_name: string;
        product_code: string;
        planned_start_after: string;
        planned_start_before: string;
    };
    statusFilters: Set<string>;
    availableStatuses: any[];
    onFilterChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onStatusFilterChange: (key: string) => void;
    onSearch: () => void;
    onReset: () => void;
}

const WorkProgressFilters: React.FC<WorkProgressFiltersProps> = ({
    filters, statusFilters, availableStatuses, onFilterChange, onStatusFilterChange, onSearch, onReset
}) => {
    return (
        <div className="mb-3">
            <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-md-between mb-3">
                <h2 className="mb-2 mb-md-0 me-md-3">作業進捗 - 生産計画一覧</h2>
                <div className="d-flex flex-wrap align-items-center">
                    <span className="me-2 fw-bold">ステータスフィルター:</span>
                    <div className="d-flex flex-wrap">
                        {availableStatuses.map(statusInfo => {
                            const isChecked = statusFilters.has(statusInfo.key);
                            return (
                                <div key={statusInfo.key} className="form-check form-check-inline me-2 mb-1">
                                    <input
                                        type="checkbox"
                                        className="form-check-input visually-hidden"
                                        id={`status-filter-${statusInfo.key}`}
                                        value={statusInfo.key}
                                        checked={isChecked}
                                        onChange={() => onStatusFilterChange(statusInfo.key)}
                                    />
                                    <label
                                        className={`btn btn-sm ${isChecked ? statusInfo.btnClass : statusInfo.btnOutlineClass}`}
                                        htmlFor={`status-filter-${statusInfo.key}`}
                                    >
                                        {statusInfo.label}
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="row g-2 align-items-end">
                <div className="col-md">
                    <label htmlFor="searchPlanName" className="form-label">計画名</label>
                    <input type="text" id="searchPlanName" name="plan_name" value={filters.plan_name} onChange={onFilterChange} className="form-control" placeholder="計画名..." />
                </div>
                <div className="col-md">
                    <label htmlFor="searchProductCode" className="form-label">製品コード</label>
                    <input type="text" id="searchProductCode" name="product_code" value={filters.product_code} onChange={onFilterChange} className="form-control" placeholder="製品コード..." />
                </div>
                <div className="col-md">
                    <label htmlFor="searchPlannedStartAfter" className="form-label">計画開始日 (以降)</label>
                    <input type="date" id="searchPlannedStartAfter" name="planned_start_after" value={filters.planned_start_after} onChange={onFilterChange} className="form-control" />
                </div>
                <div className="col-md">
                    <label htmlFor="searchPlannedStartBefore" className="form-label">計画開始日 (以前)</label>
                    <input type="date" id="searchPlannedStartBefore" name="planned_start_before" value={filters.planned_start_before} onChange={onFilterChange} className="form-control" />
                </div>
                <div className="col-md-auto">
                    <button onClick={onSearch} className="btn btn-primary w-100">検索</button>
                </div>
                <div className="col-md-auto mt-3 mt-md-0">
                    <button onClick={onReset} className="btn btn-secondary w-100">リセット</button>
                </div>
            </div>
        </div>
    );
};

export default WorkProgressFilters;
