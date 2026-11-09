import React, { useState } from 'react';
import { useQualityMaster } from '../hooks/useQualityMaster';
import { InspectionItem } from '../services/qualityService';
import QualityMasterTable from './quality/QualityMasterTable';
import QualityMasterModal from './quality/QualityMasterModal';

const QualityMasterCreation: React.FC = () => {
    const { items, loading, error, fetchItems, deleteItem } = useQualityMaster();
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InspectionItem | null>(null);

    const openModal = (item: InspectionItem | null = null) => {
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

    if (loading) return <div className="goods-receipt-page text-center py-5 text-muted">読み込み中...</div>;
    if (error) return <div className="goods-receipt-page"><div className="alert alert-danger">{error}</div></div>;

    return (
        <div className="goods-receipt-page">
            <div className="goods-receipt-filter-panel mb-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div className="d-flex align-items-center gap-2">
                    <span className="receipt-filter-label mb-0">検査項目マスター一覧</span>
                    <span className="badge rounded-pill bg-light text-secondary border px-2 py-1">
                        全 {items.length} 件
                    </span>
                </div>
                <button
                    type="button"
                    className="btn btn-primary btn-sm px-3 fw-bold shadow-sm"
                    onClick={() => openModal(null)}
                >
                    ＋ 新規検査項目登録
                </button>
            </div>

            <QualityMasterTable
                items={items}
                onEdit={openModal}
                onDelete={deleteItem}
            />

            <QualityMasterModal
                isOpen={isModalOpen}
                onClose={closeModal}
                onSuccess={handleSuccess}
                editingItem={editingItem}
            />
        </div>
    );
};

export default QualityMasterCreation;