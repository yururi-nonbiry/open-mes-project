import React from 'react';
import { InspectionItem } from '../../services/qualityService';

interface InspectionItemTableProps {
    items: InspectionItem[];
    onItemClick: (item: InspectionItem) => void;
}

const InspectionItemTable: React.FC<InspectionItemTableProps> = ({ items, onItemClick }) => {
    if (items.length === 0) {
        return (
            <div className="goods-receipt-table-card p-5 text-center text-muted">
                登録されている有効な検査項目がありません。
            </div>
        );
    }

    return (
        <div className="goods-receipt-table-card">
            <div className="table-responsive">
                <table className="table table-hover align-middle mb-0 goods-receipt-table">
                    <thead>
                        <tr>
                            <th>検査コード</th>
                            <th>検査項目名</th>
                            <th>検査タイプ</th>
                            <th>対象区分</th>
                            <th className="text-center" style={{ width: '140px' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(item => (
                            <tr key={item.id}>
                                <td className="fw-bold text-primary font-monospace">{item.code}</td>
                                <td className="fw-bold text-dark">{item.name}</td>
                                <td><span className="badge bg-light text-dark border">{item.inspection_type_display}</span></td>
                                <td className="text-secondary">{item.target_object_type_display}</td>
                                <td className="text-center">
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm px-3 fw-bold shadow-sm"
                                        onClick={() => onItemClick(item)}
                                    >
                                        検査入力
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default InspectionItemTable;
