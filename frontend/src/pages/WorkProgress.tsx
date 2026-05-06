import React, { useState } from 'react';
import { useWorkProgress } from '../hooks/useWorkProgress';
import { ProductionPlan } from '../services/productionService';
import WorkProgressTable from './production/WorkProgressTable';
import WorkProgressFilters from './production/WorkProgressFilters';
import WorkProgressModal from './production/WorkProgressModal';

const WorkProgress: React.FC = () => {
    const {
        plans, loading, error, pagination, pageInfo,
        filters, sorting, statusFilters, AVAILABLE_STATUSES,
        handleFilterChange, handleSort, handleStatusFilterChange,
        handleSearch, handleReset, fetchPlans
    } = useWorkProgress();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<ProductionPlan | null>(null);

    const openModal = (plan: ProductionPlan) => {
        setSelectedPlan(plan);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedPlan(null);
    };

    return (
        <div className="container mt-4">
            <WorkProgressFilters 
                filters={filters}
                statusFilters={statusFilters}
                availableStatuses={AVAILABLE_STATUSES}
                onFilterChange={handleFilterChange}
                onStatusFilterChange={handleStatusFilterChange}
                onSearch={handleSearch}
                onReset={handleReset}
            />

            <WorkProgressTable 
                plans={plans}
                loading={loading}
                error={error}
                pageInfo={pageInfo}
                sorting={sorting}
                onSort={handleSort}
                onOpenModal={openModal}
            />

            <div className="pagination-controls text-center mt-4">
                <button 
                    className="btn btn-outline-primary mx-1" 
                    onClick={() => fetchPlans(pagination.previous)} 
                    disabled={!pagination.previous}
                >
                    前へ
                </button>
                <span className="mx-2 align-middle">{pageInfo}</span>
                <button 
                    className="btn btn-outline-primary mx-1" 
                    onClick={() => fetchPlans(pagination.next)} 
                    disabled={!pagination.next}
                >
                    次へ
                </button>
            </div>

            <WorkProgressModal 
                isOpen={isModalOpen}
                onClose={closeModal}
                onSuccess={handleSearch}
                plan={selectedPlan}
                availableStatuses={AVAILABLE_STATUSES}
            />
        </div>
    );
};

export default WorkProgress;