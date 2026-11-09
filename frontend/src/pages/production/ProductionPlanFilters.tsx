import React from 'react';

interface ProductionPlanFiltersProps {
    filters: {
        plan_name: string;
        product_code: string;
        status: string;
        parent_plan_ref: string;
        planned_start_from: string;
        planned_start_to: string;
    };
    onFilterChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onSearch: (e: React.FormEvent) => void;
    onClear: () => void;
}

const PLAN_STATUS_TABS = [
    { value: '', label: 'すべて表示' },
    { value: 'PENDING', label: '未着手' },
    { value: 'IN_PROGRESS', label: '進行中' },
    { value: 'COMPLETED', label: '完了' },
    { value: 'ON_HOLD', label: '保留' },
    { value: 'CANCELLED', label: '中止' },
];

const ProductionPlanFilters: React.FC<ProductionPlanFiltersProps> = ({
    filters, onFilterChange, onSearch, onClear
}) => {
    const handleTabSelect = (val: string) => {
        const syntheticEvent = {
            target: { name: 'status', value: val },
        } as React.ChangeEvent<HTMLSelectElement>;
        onFilterChange(syntheticEvent);
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSearch(e);
    };

    return (
        <div className="goods-receipt-filter-panel mb-3">
            <form onSubmit={handleFormSubmit}>
                <div className="receipt-status-tabs-row mb-2">
                    <span className="filter-section-label">状態フィルタ：</span>
                    <div className="receipt-status-tabs" role="tablist">
                        {PLAN_STATUS_TABS.map(tab => (
                            <button
                                key={tab.value || 'all'}
                                type="button"
                                className={`receipt-status-tab ${filters.status === tab.value ? 'active' : ''}`}
                                onClick={() => handleTabSelect(tab.value)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="receipt-search-inputs-row">
                    <div className="receipt-search-field">
                        <label className="receipt-search-label" htmlFor="plan-filter-name">計画名</label>
                        <input
                            id="plan-filter-name"
                            type="text"
                            name="plan_name"
                            value={filters.plan_name}
                            onChange={onFilterChange}
                            className="form-control form-control-sm"
                            placeholder="計画名を入力..."
                        />
                    </div>
                    <div className="receipt-search-field">
                        <label className="receipt-search-label" htmlFor="plan-filter-product">製品コード（品番）</label>
                        <input
                            id="plan-filter-product"
                            type="text"
                            name="product_code"
                            value={filters.product_code}
                            onChange={onFilterChange}
                            className="form-control form-control-sm"
                            placeholder="製品コードを入力..."
                        />
                    </div>
                    <div className="receipt-search-field">
                        <label className="receipt-search-label" htmlFor="plan-filter-from">開始予定日（以降）</label>
                        <input
                            id="plan-filter-from"
                            type="date"
                            name="planned_start_from"
                            value={filters.planned_start_from}
                            onChange={onFilterChange}
                            className="form-control form-control-sm"
                        />
                    </div>
                    <div className="receipt-search-field">
                        <label className="receipt-search-label" htmlFor="plan-filter-to">開始予定日（以前）</label>
                        <input
                            id="plan-filter-to"
                            type="date"
                            name="planned_start_to"
                            value={filters.planned_start_to}
                            onChange={onFilterChange}
                            className="form-control form-control-sm"
                        />
                    </div>
                    <div className="receipt-search-actions">
                        <button type="submit" className="btn btn-primary btn-sm fw-bold px-3">
                            検索
                        </button>
                        <button type="button" onClick={onClear} className="btn btn-outline-secondary btn-sm">
                            条件リセット
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default ProductionPlanFilters;
