import React from 'react';
import { Spinner } from 'react-bootstrap';
import { InventoryItem, DisplaySetting } from '../../services/inventoryService';

interface InventoryTableProps {
    inventory: InventoryItem[];
    displaySettings: DisplaySetting[];
    isLoading: boolean;
    error: string | null;
    onMove: (item: InventoryItem) => void;
    onModify: (item: InventoryItem) => void;
}

const DEFAULT_COLUMNS = [
    { model_field_name: 'part_number', verbose_name: '品番' },
    { model_field_name: 'warehouse', verbose_name: '倉庫' },
    { model_field_name: 'location', verbose_name: '棚番（ロケーション）' },
    { model_field_name: 'quantity', verbose_name: '現在庫数' },
    { model_field_name: 'reserved', verbose_name: '引当済' },
    { model_field_name: 'available_quantity', verbose_name: '利用可能数' },
    { model_field_name: 'last_updated', verbose_name: '最終更新日時' },
] as DisplaySetting[];

const InventoryTable: React.FC<InventoryTableProps> = ({
    inventory, displaySettings: configuredSettings, isLoading, error, onMove, onModify
}) => {
    const displaySettings = configuredSettings.length > 0 ? configuredSettings : DEFAULT_COLUMNS;
    const colSpan = displaySettings.length + 1;

    const renderHeaders = () => (
        <tr>
            {displaySettings.map(setting => {
                const isNumeric = ['quantity', 'reserved', 'available_quantity'].includes(setting.model_field_name);
                return (
                    <th key={setting.model_field_name} className={isNumeric ? 'text-end' : ''}>
                        {setting.display_name || setting.verbose_name || setting.model_field_name}
                    </th>
                );
            })}
            <th className="text-center" style={{ width: '160px' }}>在庫操作</th>
        </tr>
    );

    const renderBody = () => {
        if (isLoading) {
            return (
                <tr>
                    <td colSpan={colSpan} className="text-center py-5">
                        <Spinner animation="border" variant="primary" size="sm" className="me-2" />
                        <span className="text-muted">在庫データを読み込んでいます...</span>
                    </td>
                </tr>
            );
        }
        if (error) {
            return (
                <tr>
                    <td colSpan={colSpan} className="text-center text-danger py-4 fw-bold">
                        {error}
                    </td>
                </tr>
            );
        }
        if (inventory.length === 0) {
            return (
                <tr>
                    <td colSpan={colSpan} className="text-center py-5 text-muted">
                        <div className="fw-bold mb-1">該当する在庫データがありません</div>
                        <div className="small">在庫0の品目も確認する場合は、上の「在庫0も含めてすべて表示」を選択してください。</div>
                    </td>
                </tr>
            );
        }

        return inventory.map(item => (
            <tr key={item.id}>
                {displaySettings.map(setting => {
                    const fieldName = setting.model_field_name;
                    let cellValue: any = item[fieldName];

                    if (fieldName === 'available_quantity') {
                        const avail = Number(cellValue ?? 0);
                        return (
                            <td key={fieldName} className="text-end">
                                <span className={avail > 0 ? 'receipt-remaining-qty has-remaining' : 'receipt-remaining-qty zero'}>
                                    {avail}
                                </span>
                            </td>
                        );
                    }

                    if (fieldName === 'part_number') {
                        return (
                            <td key={fieldName} className="fw-bold text-dark">
                                {cellValue || '—'}
                            </td>
                        );
                    }

                    if (fieldName === 'last_updated' && (typeof cellValue === 'string' || typeof cellValue === 'number')) {
                        const d = new Date(cellValue);
                        cellValue = !isNaN(d.getTime())
                            ? d.toLocaleString('ja-JP', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                              })
                            : '—';
                    } else if (typeof cellValue === 'boolean') {
                        cellValue = cellValue ? 'はい' : 'いいえ';
                    }

                    const isNumeric = ['quantity', 'reserved', 'available_quantity'].includes(fieldName);
                    return (
                        <td key={fieldName} className={isNumeric ? 'text-end fw-semibold' : ''}>
                            {cellValue !== null && cellValue !== undefined && cellValue !== '' ? cellValue : '—'}
                        </td>
                    );
                })}
                <td className="text-center text-nowrap">
                    <button
                        type="button"
                        className="btn btn-sm btn-primary fw-bold"
                        onClick={() => onMove(item)}
                    >
                        棚移動
                    </button>
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary fw-bold ms-1"
                        onClick={() => onModify(item)}
                    >
                        数量修正
                    </button>
                </td>
            </tr>
        ));
    };

    return (
        <div className="goods-receipt-table-card">
            <div className="table-responsive mb-0">
                <table className="table table-hover align-middle goods-receipt-table mb-0">
                    <thead>{renderHeaders()}</thead>
                    <tbody>{renderBody()}</tbody>
                </table>
            </div>
        </div>
    );
};

export default InventoryTable;
