import React, { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import { InventoryItem } from '../services/inventoryService';
import InventoryTable from './inventory/InventoryTable';
import InventoryFilters from './inventory/InventoryFilters';
import InventoryModifyModal from './inventory/InventoryModifyModal';
import InventoryMoveModal from './inventory/InventoryMoveModal';
import InventoryChangePurposeModal from './inventory/InventoryChangePurposeModal';
import './InventoryInquiry.css';

const InventoryInquiry: React.FC = () => {
    const {
        inventory, isLoading, error, displaySettings, searchFields,
        pagination, pageInfo, filters, handleFilterChange,
        handleSearch, fetchInventory
    } = useInventory();

    const [modifyModal, setModifyModal] = useState<{ isOpen: boolean; item: InventoryItem | null }>({
        isOpen: false,
        item: null
    });
    const [moveModal, setMoveModal] = useState<{ isOpen: boolean; item: InventoryItem | null }>({
        isOpen: false,
        item: null
    });

    const [purposeModal, setPurposeModal] = useState<{ isOpen: boolean; item: InventoryItem | null }>({
        isOpen: false,
        item: null
    });

    const openModifyModal = (item: InventoryItem) => setModifyModal({ isOpen: true, item });
    const closeModifyModal = () => setModifyModal({ isOpen: false, item: null });

    const openMoveModal = (item: InventoryItem) => setMoveModal({ isOpen: true, item });
    const closeMoveModal = () => setMoveModal({ isOpen: false, item: null });

    const openPurposeModal = (item: InventoryItem) => setPurposeModal({ isOpen: true, item });
    const closePurposeModal = () => setPurposeModal({ isOpen: false, item: null });

    return (
        <div className="inventory-inquiry container mt-2">
            <InventoryFilters 
                filters={filters}
                searchFields={searchFields}
                onFilterChange={handleFilterChange}
                onSearch={handleSearch}
            />

            <InventoryTable 
                inventory={inventory}
                displaySettings={displaySettings}
                isLoading={isLoading}
                error={error}
                onModify={openModifyModal}
                onMove={openMoveModal}
                onChangePurpose={openPurposeModal}
            />

            <div className="pagination-controls d-flex justify-content-center align-items-center mt-4">
                <button 
                    onClick={() => fetchInventory(pagination.previous)} 
                    className="btn btn-outline-primary" 
                    disabled={!pagination.previous}
                >
                    前へ
                </button>
                <span className="mx-3 align-middle">{pageInfo}</span>
                <button 
                    onClick={() => fetchInventory(pagination.next)} 
                    className="btn btn-outline-primary" 
                    disabled={!pagination.next}
                >
                    次へ
                </button>
            </div>

            <InventoryModifyModal 
                isOpen={modifyModal.isOpen}
                onClose={closeModifyModal}
                onSuccess={handleSearch}
                item={modifyModal.item}
            />

            <InventoryMoveModal 
                isOpen={moveModal.isOpen}
                onClose={closeMoveModal}
                onSuccess={handleSearch}
                item={moveModal.item}
            />
            <InventoryChangePurposeModal
                isOpen={purposeModal.isOpen}
                onClose={closePurposeModal}
                onSuccess={handleSearch}
                item={purposeModal.item}
            />
        </div>
    );
};

export default InventoryInquiry;