import React, { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import { InventoryItem } from '../services/inventoryService';
import InventoryTable from './inventory/InventoryTable';
import InventoryFilters from './inventory/InventoryFilters';
import InventoryModifyModal from './inventory/InventoryModifyModal';
import InventoryMoveModal from './inventory/InventoryMoveModal';
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

    const openModifyModal = (item: InventoryItem) => setModifyModal({ isOpen: true, item });
    const closeModifyModal = () => setModifyModal({ isOpen: false, item: null });

    const openMoveModal = (item: InventoryItem) => setMoveModal({ isOpen: true, item });
    const closeMoveModal = () => setMoveModal({ isOpen: false, item: null });

    return (
        <div className="inventory-inquiry container mt-4">
            <h2 className="inventory-inquiry-title mb-4">在庫照会</h2>

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
        </div>
    );
};

export default InventoryInquiry;