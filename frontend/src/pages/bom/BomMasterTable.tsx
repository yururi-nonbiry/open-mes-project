import React from 'react';
import { BillOfMaterial } from '../../services/bomService';

interface BomMasterTableProps {
    items: BillOfMaterial[];
    onEdit: (item: BillOfMaterial) => void;
    onDelete: (id: string, product: string, material: string) => void;
}

const BomMasterTable: React.FC<BomMasterTableProps> = ({ items, onEdit, onDelete }) => {
    return (
        <div className="table-responsive">
            <table className="table table-striped table-bordered table-hover">
                <thead className="thead-light">
                    <tr>
                        <th>製品コード</th>
                        <th>製品名</th>
                        <th>使用部品コード</th>
                        <th>部品名</th>
                        <th>所要数量</th>
                        <th>単位</th>
                        <th>備考</th>
                        <th style={{ width: "150px" }}>操作</th>
                    </tr>
                </thead>
                <tbody>
                    {items.length > 0 ? items.map(item => (
                        <tr key={item.id}>
                            <td>{item.product}</td>
                            <td>{item.product_name}</td>
                            <td>{item.material}</td>
                            <td>{item.material_name}</td>
                            <td>{item.quantity}</td>
                            <td>{item.material_unit}</td>
                            <td>{item.remarks}</td>
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
                                    onClick={() => onDelete(item.id!, item.product, item.material)}
                                >
                                    <i className="fas fa-trash-alt"></i> 削除
                                </button>
                            </td>
                        </tr>
                    )) : (
                        <tr>
                            <td colSpan={8} className="text-center">登録されている使用部品構成はありません。</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default BomMasterTable;
