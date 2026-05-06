import React, { useState } from 'react';
import { useWorkProgress } from '../hooks/useWorkProgress';
import { ProductionPlan } from '../types/production';
import WorkProgressTable from './production/WorkProgressTable';
import WorkProgressFilters from './production/WorkProgressFilters';
import WorkProgressModal from './production/WorkProgressModal';
import Pagination from '../components/common/Pagination';

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

            <Pagination 
                next={pagination.next}
                previous={pagination.previous}
                pageInfo={pageInfo}
                onPageChange={fetchPlans}
            />

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