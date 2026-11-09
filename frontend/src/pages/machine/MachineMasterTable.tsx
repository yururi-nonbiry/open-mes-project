import React from 'react';
import { Machine } from '../../services/machineService';

interface MachineMasterTableProps {
    machines: Machine[];
    onEdit: (machine: Machine) => void;
    onDelete: (id: string) => void;
}

const MachineMasterTable: React.FC<MachineMasterTableProps> = ({ machines, onEdit, onDelete }) => {
    return (
        <div className="goods-receipt-table-card">
            <div className="table-responsive">
                <table className="table table-hover align-middle mb-0 goods-receipt-table">
                    <thead>
                        <tr>
                            <th>設備番号</th>
                            <th>設備名</th>
                            <th>設置場所</th>
                            <th>説明</th>
                            <th className="text-center" style={{ width: '160px' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {machines.length > 0 ? machines.map(machine => (
                            <tr key={machine.id}>
                                <td className="fw-bold text-primary font-monospace">{machine.machine_number}</td>
                                <td className="fw-bold text-dark">{machine.name}</td>
                                <td><span className="badge bg-light text-dark border">{machine.location || '-'}</span></td>
                                <td className="text-secondary small">{machine.description || '-'}</td>
                                <td className="text-center">
                                    <div className="d-flex justify-content-center gap-1">
                                        <button className="btn btn-sm btn-outline-primary fw-bold" onClick={() => onEdit(machine)}>修正</button>
                                        <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => {
                                            if (window.confirm(`設備「${machine.name}」を削除しますか？`)) {
                                                onDelete(machine.id!);
                                            }
                                        }}>削除</button>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan={5} className="text-center py-5 text-muted">登録されている設備はありません。</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MachineMasterTable;
