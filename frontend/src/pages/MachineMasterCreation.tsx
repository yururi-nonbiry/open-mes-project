import React, { useState } from 'react';
import { useMachineMaster } from '../hooks/useMachineMaster';
import { Machine } from '../services/machineService';
import MachineMasterTable from './machine/MachineMasterTable';
import MachineMasterModal from './machine/MachineMasterModal';

const MachineMasterCreation: React.FC = () => {
    const { machines, loading, error, saveMachine, deleteMachine } = useMachineMaster();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMachine, setEditingMachine] = useState<Machine | null>(null);

    const handleAdd = () => {
        setEditingMachine(null);
        setIsModalOpen(true);
    };

    const handleEdit = (machine: Machine) => {
        setEditingMachine(machine);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingMachine(null);
    };

    return (
        <div className="goods-receipt-page">
            <div className="goods-receipt-filter-panel mb-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div className="d-flex align-items-center gap-2">
                    <span className="receipt-filter-label mb-0">登録設備一覧</span>
                    <span className="badge rounded-pill bg-light text-secondary border px-2 py-1">
                        全 {machines.length} 台
                    </span>
                </div>
                <button className="btn btn-primary btn-sm px-3 fw-bold shadow-sm" onClick={handleAdd}>
                    ＋ 新規設備登録
                </button>
            </div>

            {loading && <div className="text-center p-5"><div className="spinner-border text-primary" role="status"></div><p className="mt-2 text-muted">読み込み中...</p></div>}
            {error && <div className="alert alert-danger">エラーが発生しました: {error}</div>}

            {!loading && !error && (
                <MachineMasterTable
                    machines={machines}
                    onEdit={handleEdit}
                    onDelete={deleteMachine}
                />
            )}

            <MachineMasterModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSave={saveMachine}
                editingMachine={editingMachine}
            />
        </div>
    );
};

export default MachineMasterCreation;