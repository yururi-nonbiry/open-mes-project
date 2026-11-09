import React from 'react';
import { BillOfMaterial } from '../../services/bomService';

interface BomMasterTableProps {
    items: BillOfMaterial[];
    onEdit: (item: BillOfMaterial) => void;
    onDelete: (id: string, product: string, material: string) => void;
    onExplode: (product: string) => void;
}

const BomMasterTable: React.FC<BomMasterTableProps> = ({ items, onEdit, onDelete, onExplode }) => {
    return (
        <div className="goods-receipt-table-card">
            <div className="table-responsive mb-0">
                <table className="table table-hover align-middle goods-receipt-table mb-0">
                    <thead>
                        <tr>
                            <th>親品目コード</th>
                            <th>親品目名</th>
                            <th>使用部品コード</th>
                            <th>部品名</th>
                            <th className="text-end">所要数量</th>
                            <th>単位</th>
                            <th>備考</th>
                            <th className="text-center" style={{ width: '210px' }}>構成操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length > 0 ? items.map(item => (
                            <tr key={item.id}>
                                <td className="fw-bold text-dark">{item.product}</td>
                                <td>{item.product_name || '—'}</td>
                                <td className="fw-semibold">{item.material}</td>
                                <td>{item.material_name || '—'}</td>
                                <td className="text-end">
                                    <span className="receipt-remaining-qty has-remaining">{item.quantity}</span>
                                </td>
                                <td>{item.material_unit || '—'}</td>
                                <td>{item.remarks || '—'}</td>
                                <td className="text-center text-nowrap">
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-primary fw-bold"
                                        onClick={() => onEdit(item)}
                                    >
                                        編集
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary fw-bold ms-1"
                                        onClick={() => onExplode(item.product)}
                                    >
                                        構成展開
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-danger fw-bold ms-1"
                                        onClick={() => onDelete(item.id!, item.product, item.material)}
                                    >
                                        削除
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={8} className="text-center py-5 text-muted">
                                    登録されている使用部品構成（BOM）はありません。
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BomMasterTable;
