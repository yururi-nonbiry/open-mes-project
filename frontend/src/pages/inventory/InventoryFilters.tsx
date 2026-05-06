import React from 'react';
import { DisplaySetting } from '../../services/inventoryService';

interface InventoryFiltersProps {
    filters: Record<string, any>;
    searchFields: DisplaySetting[];
    onFilterChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSearch: () => void;
}

const InventoryFilters: React.FC<InventoryFiltersProps> = ({
    filters, searchFields, onFilterChange, onSearch
}) => {
    return (
        <div className="inventory-filters d-flex flex-wrap gap-2 align-items-center mb-3">
            {searchFields.map(field => (
                <input
                    key={field.model_field_name}
                    type="text"
                    name={field.model_field_name}
                    value={filters[field.model_field_name] || ''}
                    onChange={onFilterChange}
                    className="form-control"
                    style={{ width: 'auto', flexGrow: 1 }}
                    placeholder={`${field.display_name || field.verbose_name}で検索...`}
                />
            ))}
            <label className="form-check-label ms-2">
                <input 
                    type="checkbox" 
                    name="hideZeroStock" 
                    checked={filters.hideZeroStock} 
                    onChange={onFilterChange} 
                    className="form-check-input" 
                /> 在庫有
            </label>
            <button onClick={onSearch} className="btn btn-primary">検索</button>
        </div>
    );
};

export default InventoryFilters;
