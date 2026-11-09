import React from 'react';
import { DisplaySetting } from '../../services/inventoryService';

interface InventoryFiltersProps {
    filters: Record<string, any>;
    searchFields: DisplaySetting[];
    onFilterChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSearch: () => void;
}

const DEFAULT_SEARCH_FIELDS: DisplaySetting[] = [
    { model_field_name: 'part_number', display_name: '品番', verbose_name: '品番', is_list_display: true, is_search_field: true, display_order: 1, search_order: 1 },
    { model_field_name: 'warehouse', display_name: '倉庫', verbose_name: '倉庫', is_list_display: true, is_search_field: true, display_order: 2, search_order: 2 },
    { model_field_name: 'location', display_name: '棚番', verbose_name: '棚番', is_list_display: true, is_search_field: true, display_order: 3, search_order: 3 },
];

const InventoryFilters: React.FC<InventoryFiltersProps> = ({
    filters, searchFields, onFilterChange, onSearch
}) => {
    const activeFields = searchFields.length > 0 ? searchFields : DEFAULT_SEARCH_FIELDS;

    const setHideZeroStock = (hide: boolean) => {
        const syntheticEvent = {
            target: {
                name: 'hideZeroStock',
                type: 'checkbox',
                checked: hide,
                value: String(hide),
            },
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        onFilterChange(syntheticEvent);
    };

    return (
        <div className="goods-receipt-filter-panel mb-3">
            <div className="receipt-status-tabs-row">
                <span className="filter-section-label">表示対象：</span>
                <div className="receipt-status-tabs" role="tablist" aria-label="在庫表示フィルタ">
                    <button
                        type="button"
                        className={`receipt-status-tab ${filters.hideZeroStock ? 'active' : ''}`}
                        onClick={() => setHideZeroStock(true)}
                    >
                        在庫ありのみ表示
                    </button>
                    <button
                        type="button"
                        className={`receipt-status-tab ${!filters.hideZeroStock ? 'active' : ''}`}
                        onClick={() => setHideZeroStock(false)}
                    >
                        在庫0も含めてすべて表示
                    </button>
                </div>
            </div>

            <div className="receipt-search-inputs-row">
                {activeFields.map(field => {
                    const labelText = field.display_name || field.verbose_name || field.model_field_name;
                    return (
                        <div key={field.model_field_name} className="receipt-search-field">
                            <label className="receipt-search-label" htmlFor={`inv-search-${field.model_field_name}`}>
                                {labelText}
                            </label>
                            <input
                                id={`inv-search-${field.model_field_name}`}
                                type="text"
                                name={field.model_field_name}
                                value={filters[field.model_field_name] || ''}
                                onChange={onFilterChange}
                                className="form-control form-control-sm"
                                placeholder={`${labelText}を入力...`}
                            />
                        </div>
                    );
                })}
                <div className="receipt-search-actions">
                    <button type="button" onClick={onSearch} className="btn btn-primary btn-sm fw-bold px-3">
                        検索
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InventoryFilters;
