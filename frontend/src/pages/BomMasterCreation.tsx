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
        <div className="container-fluid mt-4">
            <h4>使用部品マスター管理</h4>
            <p className="text-muted">
                製品・中間品ごとに、1個を作るのに必要な使用部品（材料・中間品）と数量を登録します。
                中間品にも構成を登録することで多階層の構成になります。生産計画の作成時に、ここでの構成（1階層目）が計画の部品構成としてコピーされます。
            </p>
            <button
                type="button"
                className="btn btn-primary mb-3"
                onClick={() => openModal(null)}
            >
                <i className="fas fa-plus"></i> 新規登録
            </button>
            <button
                type="button"
                className="btn btn-secondary mb-3 ml-2"
                onClick={() => setExplodeTarget({ isOpen: true })}
            >
                構成の展開
            </button>

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
