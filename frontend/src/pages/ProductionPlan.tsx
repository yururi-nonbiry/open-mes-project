import React, { useState } from 'react';
import { useProductionPlans } from '../hooks/useProductionPlans';
import { ProductionPlan as ProductionPlanType } from '../services/productionService';
import ProductionPlanTable from './production/ProductionPlanTable';
import ProductionPlanFilters from './production/ProductionPlanFilters';
import ProductionPlanDetailModal from './production/ProductionPlanDetailModal';
import ProductionPlanAllocateModal from './production/ProductionPlanAllocateModal';

const ProductionPlan: React.FC = () => {
    const {
        plans, loading, error, pagination, pageInfo,
        filters, handleFilterChange, handleSearch, handleClearSearch, fetchPlans
    } = useProductionPlans();

    const [detailModal, setDetailModal] = useState<{ isOpen: boolean; plan: ProductionPlanType | null }>({
        isOpen: false,
        plan: null
    });
    const [allocateModal, setAllocateModal] = useState<{ isOpen: boolean; plan: ProductionPlanType | null }>({
        isOpen: false,
        plan: null
    });

    const openDetailModal = (plan: ProductionPlanType) => setDetailModal({ isOpen: true, plan });
    const closeDetailModal = () => setDetailModal({ isOpen: false, plan: null });

    const openAllocateModal = (plan: ProductionPlanType) => setAllocateModal({ isOpen: true, plan });
    const closeAllocateModal = () => setAllocateModal({ isOpen: false, plan: null });

    return (
        <div className="container mt-4">
            <h2 className="text-center mb-4">生産計画検索</h2>
            
            <ProductionPlanFilters 
                filters={filters}
                onFilterChange={handleFilterChange}
                onSearch={handleSearch}
                onClear={handleClearSearch}
            />

            <ProductionPlanTable 
                plans={plans}
                loading={loading}
                error={error}
                onDetail={openDetailModal}
                onAllocate={openAllocateModal}
            />

            <div className="text-center mt-4 mb-5">
                <button 
                    onClick={() => fetchPlans(pagination.previous)} 
                    className="btn btn-outline-primary mx-1" 
                    disabled={!pagination.previous}
                >
                    前へ
                </button>
                <span className="mx-3 align-middle">{pageInfo}</span>
                <button 
                    onClick={() => fetchPlans(pagination.next)} 
                    className="btn btn-outline-primary mx-1" 
                    disabled={!pagination.next}
                >
                    次へ
                </button>
            </div>

            <ProductionPlanDetailModal 
                isOpen={detailModal.isOpen}
                onClose={closeDetailModal}
                plan={detailModal.plan}
            />

            <ProductionPlanAllocateModal 
                isOpen={allocateModal.isOpen}
                onClose={closeAllocateModal}
                onSuccess={handleSearch}
                plan={allocateModal.plan}
            />
        </div>
    );
};

export default ProductionPlan;