import React from 'react';
import { InspectionItem } from '../../services/qualityService';

interface QualityMasterTableProps {
    items: InspectionItem[];
    onEdit: (item: InspectionItem) => void;
    onDelete: (id: string, code: string) => void;
}

const QualityMasterTable: React.FC<QualityMasterTableProps> = ({ items, onEdit, onDelete }) => {
    return (
        <div className="goods-receipt-table-card">
            <div className="table-responsive">
                <table className="table table-hover align-middle mb-0 goods-receipt-table">
                    <thead>
                        <tr>
                            <th>検査コード</th>
                            <th>検査項目名</th>
                            <th>検査種別</th>
                            <th>対象物タイプ</th>
                            <th className="text-center">有効状態</th>
                            <th className="text-center" style={{ width: '160px' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length > 0 ? items.map(item => (
                            <tr key={item.id}>
                                <td className="fw-bold text-primary font-monospace">{item.code}</td>
                                <td className="fw-bold text-dark">{item.name}</td>
                                <td><span className="badge bg-light text-dark border">{item.inspection_type_display}</span></td>
                                <td className="text-secondary">{item.target_object_type_display}</td>
                                <td className="text-center">
                                    {item.is_active ?
                                        <span className="status-mono-badge is-active">有効</span> :
                                        <span className="status-mono-badge is-inactive">無効</span>
                                    }
                                </td>
                                <td className="text-center">
                                    <div className="d-flex justify-content-center gap-1">
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-primary fw-bold"
                                            onClick={() => onEdit(item)}
                                        >
                                            変更
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-danger fw-bold"
                                            onClick={() => onDelete(item.id!, item.code)}
                                        >
                                            削除
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={6} className="text-center py-5 text-muted">登録されている検査項目はありません。</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default QualityMasterTable;
