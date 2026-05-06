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

const ProductionPlanFilters: React.FC<ProductionPlanFiltersProps> = ({
    filters, onFilterChange, onSearch, onClear
}) => {
    return (
        <div className="card card-body bg-light mb-4 shadow-sm">
            <form onSubmit={onSearch}>
                <div className="row gx-2 gy-2 mb-3">
                    <div className="col-md">
                        <input type="text" name="plan_name" value={filters.plan_name} onChange={onFilterChange} className="form-control form-control-sm" placeholder="計画名" />
                    </div>
                    <div className="col-md">
                        <input type="text" name="product_code" value={filters.product_code} onChange={onFilterChange} className="form-control form-control-sm" placeholder="製品コード" />
                    </div>
                    <div className="col-md">
                        <select name="status" value={filters.status} onChange={onFilterChange} className="form-select form-select-sm">
                            <option value="">ステータス (すべて)</option>
                            <option value="PENDING">未着手</option>
                            <option value="IN_PROGRESS">進行中</option>
                            <option value="COMPLETED">完了</option>
                            <option value="ON_HOLD">保留</option>
                            <option value="CANCELLED">中止</option>
                        </select>
                    </div>
                    <div className="col-md">
                        <input type="text" name="parent_plan_ref" value={filters.parent_plan_ref} onChange={onFilterChange} className="form-control form-control-sm" placeholder="親計画ID" />
                    </div>
                </div>
                <div className="row gx-2 gy-2 align-items-end">
                    <div className="col-md-auto">
                        <label className="form-label mb-0 me-1">計画開始日:</label>
                    </div>
                    <div className="col-md">
                        <input type="date" name="planned_start_from" value={filters.planned_start_from} onChange={onFilterChange} className="form-control form-control-sm" />
                    </div>
                    <div className="col-md-auto text-center px-1">～</div>
                    <div className="col-md">
                        <input type="date" name="planned_start_to" value={filters.planned_start_to} onChange={onFilterChange} className="form-control form-control-sm" />
                    </div>
                    <div className="col-md-auto ms-md-2 mt-2 mt-md-0">
                        <button type="submit" className="btn btn-success btn-sm me-1">検索</button>
                        <button type="button" onClick={onClear} className="btn btn-danger btn-sm">クリア</button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default ProductionPlanFilters;
