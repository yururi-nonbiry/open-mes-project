import React from 'react';
import { InspectionItem } from '../../services/qualityService';

interface QualityMasterTableProps {
    items: InspectionItem[];
    onEdit: (item: InspectionItem) => void;
    onDelete: (id: string, code: string) => void;
}

const QualityMasterTable: React.FC<QualityMasterTableProps> = ({ items, onEdit, onDelete }) => {
    return (
        <div className="table-responsive">
            <table className="table table-striped table-bordered table-hover">
                <thead className="thead-light">
                    <tr>
                        <th>コード</th>
                        <th>検査項目名</th>
                        <th>検査種別</th>
                        <th>対象物タイプ</th>
                        <th>有効</th>
                        <th style={{ width: "150px" }}>操作</th>
                    </tr>
                </thead>
                <tbody>
                    {items.length > 0 ? items.map(item => (
                        <tr key={item.id}>
                            <td>{item.code}</td>
                            <td>{item.name}</td>
                            <td>{item.inspection_type_display}</td>
                            <td>{item.target_object_type_display}</td>
                            <td>
                                {item.is_active ? 
                                    <span className="badge badge-success">はい</span> : 
                                    <span className="badge badge-secondary">いいえ</span>
                                }
                            </td>
                            <td>
                                <button 
                                    type="button" 
                                    className="btn btn-sm btn-info" 
                                    onClick={() => onEdit(item)}
                                >
                                    <i className="fas fa-edit"></i> 変更
                                </button>
                                <button 
                                    type="button" 
                                    className="btn btn-sm btn-danger ml-2" 
                                    onClick={() => onDelete(item.id!, item.code)}
                                >
                                    <i className="fas fa-trash-alt"></i> 削除
                                </button>
                            </td>
                        </tr>
                    )) : (
                        <tr>
                            <td colSpan={6} className="text-center">登録されている検査項目はありません。</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default QualityMasterTable;
