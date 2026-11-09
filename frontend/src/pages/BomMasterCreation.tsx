import React, { useState } from 'react';
import { useBomMaster } from '../hooks/useBomMaster';
import { BillOfMaterial } from '../services/bomService';
import BomMasterTable from './bom/BomMasterTable';
import BomMasterModal from './bom/BomMasterModal';
import BomExplodeModal from './bom/BomExplodeModal';

const BomMasterCreation: React.FC = () => {
    const { items, loading, error, fetchItems, deleteItem } = useBomMaster();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<BillOfMaterial | null>(null);
    const [explodeTarget, setExplodeTarget] = useState<{ isOpen: boolean; product?: string }>({ isOpen: false });

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
        <div className="container-fluid mt-2">
            <div className="d-flex flex-wrap gap-2 mb-3">
                <button
                    type="button"
                    className="btn btn-primary fw-bold"
                    onClick={() => openModal(null)}
                >
                    ＋ 新規登録
                </button>
                <button
                    type="button"
                    className="btn btn-outline-secondary fw-bold"
                    onClick={() => setExplodeTarget({ isOpen: true })}
                >
                    構成の展開
                </button>
            </div>

            <BomMasterTable
                items={items}
                onEdit={openModal}
                onDelete={deleteItem}
                onExplode={(product) => setExplodeTarget({ isOpen: true, product })}
            />

            <BomMasterModal
                isOpen={isModalOpen}
                onClose={closeModal}
                onSuccess={handleSuccess}
                editingItem={editingItem}
            />

            <BomExplodeModal
                isOpen={explodeTarget.isOpen}
                onClose={() => setExplodeTarget({ isOpen: false })}
                initialProduct={explodeTarget.product}
            />
        </div>
    );
};

export default BomMasterCreation;
