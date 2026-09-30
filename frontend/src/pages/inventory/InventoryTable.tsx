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

// 表示設定が未登録の場合に使用する既定の列
const DEFAULT_COLUMNS = [
    { model_field_name: 'part_number', verbose_name: '品番' },
    { model_field_name: 'warehouse', verbose_name: '倉庫' },
    { model_field_name: 'location', verbose_name: '場所' },
    { model_field_name: 'quantity', verbose_name: '在庫数' },
    { model_field_name: 'reserved', verbose_name: '引当在庫' },
    { model_field_name: 'available_quantity', verbose_name: '利用可能数' },
    { model_field_name: 'last_updated', verbose_name: '最終更新日時' },
] as DisplaySetting[];

const InventoryTable: React.FC<InventoryTableProps> = ({
    inventory, displaySettings: configuredSettings, isLoading, error, onMove, onModify
}) => {
    // 一覧表示対象の設定が無い場合は既定の列で表示する(見出しと明細で同じ列定義を使う)
    const displaySettings = configuredSettings.length > 0 ? configuredSettings : DEFAULT_COLUMNS;
    const colSpan = displaySettings.length + 1;

    if (isLoading) return <div className="text-center p-3">検索中...</div>;
    if (error) return <div className="alert alert-danger">{error}</div>;

    const renderHeaders = () => {
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
