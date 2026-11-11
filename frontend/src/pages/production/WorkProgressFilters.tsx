import React from 'react';
import type { StatusOption } from './types';

interface WorkProgressFiltersProps {
    filters: {
        plan_name: string;
        product_code: string;
        planned_start_after: string;
        planned_start_before: string;
    };
    statusFilters: Set<string>;
    availableStatuses: StatusOption[];
    onFilterChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onStatusFilterChange: (key: string) => void;
    onSearch: () => void;
    onReset: () => void;
}

const WorkProgressFilters: React.FC<WorkProgressFiltersProps> = ({
    filters, statusFilters, availableStatuses, onFilterChange, onStatusFilterChange, onSearch, onReset
}) => {
    return (
        <div className="goods-receipt-filter-panel mb-3">
            <div className="receipt-status-tabs-row">
                <span className="filter-section-label">状態フィルタ（複数選択可）：</span>
                <div className="receipt-status-tabs">
                    {availableStatuses.map(statusInfo => {
                        const isChecked = statusFilters.has(statusInfo.key);
                        return (
                            <button
                                key={statusInfo.key}
                                type="button"
                                className={`receipt-status-tab ${isChecked ? 'active' : ''}`}
                                onClick={() => onStatusFilterChange(statusInfo.key)}
                            >
                                {statusInfo.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="receipt-search-inputs-row">
                <div className="receipt-search-field">
                    <label htmlFor="searchPlanName" className="receipt-search-label">計画名</label>
                    <input
                        type="text"
                        id="searchPlanName"
                        name="plan_name"
                        value={filters.plan_name}
                        onChange={onFilterChange}
                        className="form-control form-control-sm"
                        placeholder="計画名を入力..."
                    />
                </div>
                <div className="receipt-search-field">
                    <label htmlFor="searchProductCode" className="receipt-search-label">製品コード（品番）</label>
                    <input
                        type="text"
                        id="searchProductCode"
                        name="product_code"
                        value={filters.product_code}
                        onChange={onFilterChange}
                        className="form-control form-control-sm"
                        placeholder="製品コードを入力..."
                    />
                </div>
                <div className="receipt-search-field">
                    <label htmlFor="searchPlannedStartAfter" className="receipt-search-label">開始予定日（以降）</label>
                    <input
                        type="date"
                        id="searchPlannedStartAfter"
                        name="planned_start_after"
                        value={filters.planned_start_after}
                        onChange={onFilterChange}
                        className="form-control form-control-sm"
                    />
                </div>
                <div className="receipt-search-field">
                    <label htmlFor="searchPlannedStartBefore" className="receipt-search-label">開始予定日（以前）</label>
                    <input
                        type="date"
                        id="searchPlannedStartBefore"
                        name="planned_start_before"
                        value={filters.planned_start_before}
                        onChange={onFilterChange}
                        className="form-control form-control-sm"
                    />
                </div>
                <div className="receipt-search-actions">
                    <button type="button" onClick={onSearch} className="btn btn-primary btn-sm fw-bold px-3">
                        検索
                    </button>
                    <button type="button" onClick={onReset} className="btn btn-outline-secondary btn-sm">
                        条件リセット
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WorkProgressFilters;
