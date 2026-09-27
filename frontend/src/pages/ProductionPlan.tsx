import React, { useState } from 'react';
import { useProductionPlans } from '../hooks/useProductionPlans';
import { ProductionPlan as ProductionPlanType } from '../services/productionService';
import ProductionPlanTable from './production/ProductionPlanTable';
import ProductionPlanFilters from './production/ProductionPlanFilters';
import ProductionPlanDetailModal from './production/ProductionPlanDetailModal';
import ProductionPlanAllocateModal from './production/ProductionPlanAllocateModal';
import ProductionPlanMaterialsModal from './production/ProductionPlanMaterialsModal';
import ProductionPlanAdditionalIssueModal from './production/ProductionPlanAdditionalIssueModal';
import ProductionPlanIntermediatesModal from './production/ProductionPlanIntermediatesModal';

type PlanModalState = { isOpen: boolean; plan: ProductionPlanType | null };
const closedModal: PlanModalState = { isOpen: false, plan: null };

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

    const [materialsModal, setMaterialsModal] = useState<PlanModalState>(closedModal);
    const [additionalIssueModal, setAdditionalIssueModal] = useState<PlanModalState>(closedModal);
    const [intermediatesModal, setIntermediatesModal] = useState<PlanModalState>(closedModal);

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
                onMaterials={(plan) => setMaterialsModal({ isOpen: true, plan })}
                onAdditionalIssue={(plan) => setAdditionalIssueModal({ isOpen: true, plan })}
                onIntermediates={(plan) => setIntermediatesModal({ isOpen: true, plan })}
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

            <ProductionPlanMaterialsModal
                isOpen={materialsModal.isOpen}
                onClose={() => {
                    setMaterialsModal(closedModal);
                    // 中間品を追加・所要数を変えると子計画が自動で作られることがあるため一覧を更新する
                    handleSearch();
                }}
                plan={materialsModal.plan}
            />

            <ProductionPlanAdditionalIssueModal
                isOpen={additionalIssueModal.isOpen}
                onClose={() => setAdditionalIssueModal(closedModal)}
                plan={additionalIssueModal.plan}
            />

            <ProductionPlanIntermediatesModal
                isOpen={intermediatesModal.isOpen}
                onClose={() => setIntermediatesModal(closedModal)}
                onChanged={handleSearch}
                plan={intermediatesModal.plan}
            />
        </div>
    );
};

export default ProductionPlan;