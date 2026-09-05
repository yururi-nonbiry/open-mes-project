import React, { useState } from 'react';
import { useBomMaster } from '../hooks/useBomMaster';
import { BillOfMaterial } from '../services/bomService';
import BomMasterTable from './bom/BomMasterTable';
import BomMasterModal from './bom/BomMasterModal';

const BomMasterCreation: React.FC = () => {
    const { items, loading, error, fetchItems, deleteItem } = useBomMaster();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<BillOfMaterial | null>(null);

    const openModal = (item: BillOfMaterial | null = null) => {
        setEditingItem(item);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
    };

    const handleSuccess = () => {
        fetchItems();
    };

    if (loading) return <div className="container mt-4">読み込み中...</div>;
    if (error) return <div className="container mt-4"><div className="alert alert-danger">{error}</div></div>;

    return (
        <div className="container-fluid mt-4">
            <h4>使用部品マスター管理</h4>
            <p className="text-muted">製品ごとに、製品1個を作るのに必要な使用部品と数量を登録します。</p>
            <button
                type="button"
                className="btn btn-primary mb-3"
                onClick={() => openModal(null)}
            >
                <i className="fas fa-plus"></i> 新規登録
            </button>

            <BomMasterTable
                items={items}
                onEdit={openModal}
                onDelete={deleteItem}
            />

            <BomMasterModal
                isOpen={isModalOpen}
                onClose={closeModal}
                onSuccess={handleSuccess}
                editingItem={editingItem}
            />
        </div>
    );
};

export default BomMasterCreation;
