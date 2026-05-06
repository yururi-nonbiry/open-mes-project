import React from 'react';
import { InventoryItem, DisplaySetting } from '../../services/inventoryService';

interface InventoryTableProps {
    inventory: InventoryItem[];
    displaySettings: DisplaySetting[];
    isLoading: boolean;
    error: string | null;
    onMove: (item: InventoryItem) => void;
    onModify: (item: InventoryItem) => void;
}

const InventoryTable: React.FC<InventoryTableProps> = ({
    inventory, displaySettings, isLoading, error, onMove, onModify
}) => {
    const colSpan = displaySettings.length > 0 ? displaySettings.length + 1 : 8;

    if (isLoading) return <div className="text-center p-3">検索中...</div>;
    if (error) return <div className="alert alert-danger">{error}</div>;

    const renderHeaders = () => {
        if (displaySettings.length === 0) {
            return (
                <tr>
                    <th>製品/材料名</th>
                    <th>倉庫</th>
                    <th>場所</th>
                    <th className="text-end">在庫数</th>
                    <th className="text-end">引当在庫</th>
                    <th className="text-end">利用可能数</th>
                    <th>最終更新日時</th>
                    <th className="text-center">操作</th>
                </tr>
            );
        }

        return (
            <tr>
                {displaySettings.map(setting => {
                    const isNumeric = ['quantity', 'reserved', 'available_quantity'].includes(setting.model_field_name);
                    return (
                        <th key={setting.model_field_name} className={isNumeric ? 'text-end' : ''}>
                            {setting.display_name || setting.verbose_name || setting.model_field_name}
                        </th>
                    );
                })}
                <th className="text-center">操作</th>
            </tr>
        );
    };

    const renderBody = () => {
        if (inventory.length === 0) {
            return <tr><td colSpan={colSpan} className="text-center">該当する在庫情報がありません。</td></tr>;
        }

        return inventory.map(item => (
            <tr key={item.id}>
                {displaySettings.map(setting => {
                    const fieldName = setting.model_field_name;
                    let cellValue = item[fieldName];
                    if (fieldName === 'last_updated' && (typeof cellValue === 'string' || typeof cellValue === 'number')) {
                        cellValue = cellValue ? new Date(cellValue).toLocaleString() : 'N/A';
                    } else if (typeof cellValue === 'boolean') {
                        cellValue = cellValue ? 'はい' : 'いいえ';
                    }
                    const isNumeric = ['quantity', 'reserved', 'available_quantity'].includes(fieldName);
                    return <td key={fieldName} className={isNumeric ? 'text-end' : ''}>{cellValue ?? 'N/A'}</td>;
                })}
                <td className="text-center">
                    <button className="btn btn-sm btn-info ms-1" onClick={() => onMove(item)}>移動</button>
                    <button className="btn btn-sm btn-warning ms-1" onClick={() => onModify(item)}>修正</button>
                </td>
            </tr>
        ));
    };

    return (
        <div className="table-responsive">
            <table className="table table-striped table-bordered table-hover mb-0">
                <thead>{renderHeaders()}</thead>
                <tbody>{renderBody()}</tbody>
            </table>
        </div>
    );
};

export default InventoryTable;
