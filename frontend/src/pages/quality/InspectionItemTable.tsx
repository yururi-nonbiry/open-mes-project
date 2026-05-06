import React from 'react';
import { InspectionItem } from '../../services/qualityService';

interface InspectionItemTableProps {
    items: InspectionItem[];
    onItemClick: (item: InspectionItem) => void;
}

const InspectionItemTable: React.FC<InspectionItemTableProps> = ({ items, onItemClick }) => {
    if (items.length === 0) {
        return <p className="text-muted">登録されている有効な検査項目がありません。</p>;
    }

    return (
        <div className="table-responsive">
            <table className="table table-hover table-striped border">
                <thead className="thead-light">
                    <tr>
                        <th>コード</th>
                        <th>名称</th>
                        <th>検査タイプ</th>
                        <th>対象</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(item => (
                        <tr key={item.id}>
                            <td>{item.code}</td>
                            <td>
                                <button 
                                    className="btn btn-link p-0 text-decoration-none" 
                                    onClick={() => onItemClick(item)}
                                >
                                    {item.name}
                                </button>
                            </td>
                            <td>{item.inspection_type_display}</td>
                            <td>{item.target_object_type_display}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default InspectionItemTable;
