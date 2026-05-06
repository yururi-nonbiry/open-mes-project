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

    if (loading) return <div className="container mt-4">読み込み中...</div>;
    if (error) return <div className="container mt-4"><div className="alert alert-danger">{error}</div></div>;

    return (
        <div className="container-fluid mt-4">
            <h4>検査項目マスター管理</h4>
            <button 
                type="button" 
                className="btn btn-primary mb-3" 
                onClick={() => openModal(null)}
            >
                <i className="fas fa-plus"></i> 新規登録
            </button>

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