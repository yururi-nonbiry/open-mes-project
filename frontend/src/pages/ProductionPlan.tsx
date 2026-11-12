import type { ApiErrorLike } from './apiErrorTypes';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useProductionPlans } from '../hooks/useProductionPlans';
import productionService, { ProductionPlan as ProductionPlanType } from '../services/productionService';
import { BulkAllocationResult, PlanAllocationOverview } from '../types/production';
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

    // 一覧での引当状況の表示と、チェックした計画のまとめ引当
    const [overviews, setOverviews] = useState<Record<string, PlanAllocationOverview>>({});
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkResults, setBulkResults] = useState<BulkAllocationResult[] | null>(null);
    const [bulkError, setBulkError] = useState<string | null>(null);

    const loadOverviews = useCallback(async (targets: ProductionPlanType[]) => {
        try {
            const rows = await productionService.getAllocationOverview(targets.map(p => p.id));
            setOverviews(Object.fromEntries(rows.map(r => [r.plan_id, r])));
        } catch {
            setOverviews({}); // 取得できなくても一覧自体は使えるようにする
        }
    }, []);

    useEffect(() => {
        setSelectedIds(new Set());
        loadOverviews(plans);
    }, [plans, loadOverviews]);

    /** まとめ引当の対象にできる計画(完了・中止を除き、未引当の部品がある計画) */
    const isBulkAllocatable = useCallback((plan: ProductionPlanType) => {
        const state = overviews[plan.id]?.state;
        return !['COMPLETED', 'CANCELLED'].includes(plan.status) && (state === 'READY' || state === 'SHORTAGE');
    }, [overviews]);
    const selectablePlans = useMemo(() => plans.filter(isBulkAllocatable), [plans, isBulkAllocatable]);

    const toggleSelected = (id: string, checked: boolean) => setSelectedIds(prev => {
        const next = new Set(prev);
        if (checked) next.add(id); else next.delete(id);
        return next;
    });
    const toggleAll = (checked: boolean) => setSelectedIds(checked ? new Set(selectablePlans.map(p => p.id)) : new Set());

    const handleBulkAllocate = async () => {
        const targets = plans.filter(p => selectedIds.has(p.id));
        if (targets.length === 0) return;
        const shortageCount = targets.filter(p => overviews[p.id]?.state === 'SHORTAGE').length;
        const message = `チェックした ${targets.length} 件の生産計画の未引当分を、在庫の多い倉庫から引き当てます。`
            + (shortageCount > 0 ? `\n在庫不足の計画が ${shortageCount} 件あり、引き当てられる分のみ引き当てます。` : '')
            + '\nよろしいですか？';
        if (!window.confirm(message)) return;
        setBulkLoading(true);
        setBulkError(null);
        try {
            setBulkResults(await productionService.bulkAllocateMaterials(targets.map(p => p.id)));
        } catch (e) {
            setBulkResults(null);
            setBulkError((e as ApiErrorLike).message);
        } finally {
            setBulkLoading(false);
        }
        handleSearch(); // 一覧と引当状況を最新にする
    };

    const openDetailModal = (plan: ProductionPlanType) => setDetailModal({ isOpen: true, plan });
    const closeDetailModal = () => setDetailModal({ isOpen: false, plan: null });

    const openAllocateModal = (plan: ProductionPlanType) => setAllocateModal({ isOpen: true, plan });
    const closeAllocateModal = () => setAllocateModal({ isOpen: false, plan: null });

    return (
        <div className="goods-receipt-page">
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
                overviews={overviews}
                isSelectable={isBulkAllocatable}
                selectedIds={selectedIds}
                onToggleSelected={toggleSelected}
                onToggleAll={toggleAll}
                onBulkAllocate={handleBulkAllocate}
                bulkLoading={bulkLoading}
                bulkResults={bulkResults}
                bulkError={bulkError}
                onCloseBulkResults={() => { setBulkResults(null); setBulkError(null); }}
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
                onUpdated={(updated) => {
                    setDetailModal({ isOpen: true, plan: updated });
                    fetchPlans();
                }}
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