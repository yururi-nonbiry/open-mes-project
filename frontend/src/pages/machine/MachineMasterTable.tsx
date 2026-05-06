import React from 'react';
import { Machine } from '../../services/machineService';

interface MachineMasterTableProps {
    machines: Machine[];
    onEdit: (machine: Machine) => void;
    onDelete: (id: string) => void;
}

const MachineMasterTable: React.FC<MachineMasterTableProps> = ({ machines, onEdit, onDelete }) => {
    return (
        <div className="table-responsive">
            <table className="table table-striped table-hover table-bordered">
                <thead className="thead-light">
                    <tr>
                        <th>設備番号</th>
                        <th>設備名</th>
                        <th>設置場所</th>
                        <th>説明</th>
                        <th className="text-center">アクション</th>
                    </tr>
                </thead>
                <tbody>
                    {machines.length > 0 ? machines.map(machine => (
                        <tr key={machine.id}>
                            <td>{machine.machine_number}</td>
                            <td>{machine.name}</td>
                            <td>{machine.location || '-'}</td>
                            <td>{machine.description || '-'}</td>
                            <td className="text-center">
                                <button className="btn btn-sm btn-outline-primary me-2" onClick={() => onEdit(machine)}>修正</button>
                                <button className="btn btn-sm btn-outline-danger" onClick={() => {
                                    if (window.confirm(`設備「${machine.name}」を削除しますか？`)) {
                                        onDelete(machine.id!);
                                    }
                                }}>削除</button>
                            </td>
                        </tr>
                    )) : (
                        <tr><td colSpan={5} className="text-center">登録されている設備はありません。</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default MachineMasterTable;
