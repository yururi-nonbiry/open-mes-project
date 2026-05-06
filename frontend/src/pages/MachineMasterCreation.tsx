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
        <div className="container mt-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2 className="mb-0">マスター作成（設備管理）</h2>
                <button className="btn btn-primary" onClick={handleAdd}>新規設備登録</button>
            </div>

            {loading && <div className="text-center p-5"><div className="spinner-border text-primary" role="status"></div><p className="mt-2">読み込み中...</p></div>}
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