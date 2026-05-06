import React, { useState } from 'react';
import { Container } from 'react-bootstrap';
import { MASTER_CARDS, BUSINESS_CARDS } from '../config/dataImportConfigs';
import { useDataManagement } from '../hooks/useDataManagement';
import { useCsvImport } from '../hooks/useCsvImport';
import DataCardList from './import/DataCardList';
import CsvImportSection from './import/CsvImportSection';
import { RegisterModal, ListModal, DeleteConfirmModal, CsvResultModal } from './import/ManagementModals';

const DataImport: React.FC = () => {
    const {
        isLoading, error, modalConfig, setModalConfig, listData, formData, setFormData,
        fetchListData, fetchRecordDetail, saveRecord, deleteRecord
    } = useDataManagement();

    const {
        isLoading: isCsvLoading, taskId, taskStatus, progress, csvResult,
        showResultModal: showCsvResultModal, setShowResultModal: setShowCsvResultModal,
        uploadCsv, cancelUpload
    } = useCsvImport();

    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showListModal, setShowListModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<any>(null);

    const handleRegister = (type: string) => {
        setModalConfig({ type, name: type, recordId: null });
        setFormData({});
        setShowRegisterModal(true);
    };

    const handleList = (type: string) => {
        setModalConfig({ type, name: type });
        setShowListModal(true);
        fetchListData(type);
    };

    const handleEdit = async (id: string | number) => {
        setShowListModal(false);
        setModalConfig(prev => ({ ...prev, recordId: id }));
        await fetchRecordDetail(modalConfig.type, id);
        setShowRegisterModal(true);
    };

    const handleDeleteClick = (item: any) => {
        setItemToDelete({ ...item, displayName: item.name || item.code || `ID: ${item.id}` });
        setShowDeleteModal(true);
    };

    const handleSave = async () => {
        const success = await saveRecord();
        if (success) {
            setShowRegisterModal(false);
            if (showListModal) fetchListData(modalConfig.type);
        }
    };

    const handleDeleteConfirm = async () => {
        if (itemToDelete) {
            const success = await deleteRecord(modalConfig.type, itemToDelete.id);
            if (success) setShowDeleteModal(false);
        }
    };

    return (
        <Container className="py-5">
            <h2 className="mb-3 fw-bold">データインポート・管理</h2>
            <p className="text-muted mb-5">システムの基盤となるマスターデータや、日々の業務データを管理・インポートします。</p>

            <DataCardList 
                title="マスターデータ" 
                cards={MASTER_CARDS} 
                onRegister={handleRegister} 
                onList={handleList} 
            />

            <DataCardList 
                title="業務データ" 
                cards={BUSINESS_CARDS} 
                onRegister={handleRegister} 
                onList={handleList} 
            />

            <CsvImportSection 
                isLoading={isCsvLoading}
                taskId={taskId}
                taskStatus={taskStatus}
                progress={progress}
                onUpload={uploadCsv}
                onCancel={cancelUpload}
            />

            {/* Modals */}
            <RegisterModal 
                show={showRegisterModal} 
                onHide={() => setShowRegisterModal(false)}
                config={modalConfig}
                formData={formData}
                setFormData={setFormData}
                isLoading={isLoading}
                error={error}
                onSave={handleSave}
            />

            <ListModal 
                show={showListModal}
                onHide={() => setShowListModal(false)}
                config={modalConfig}
                listData={listData}
                isLoading={isLoading}
                error={error}
                onEdit={handleEdit}
                onDelete={handleDeleteClick}
            />

            <DeleteConfirmModal 
                show={showDeleteModal}
                onHide={() => setShowDeleteModal(false)}
                item={itemToDelete}
                onConfirm={handleDeleteConfirm}
                isLoading={isLoading}
            />

            <CsvResultModal 
                show={showCsvResultModal}
                onHide={() => setShowCsvResultModal(false)}
                result={csvResult}
            />
        </Container>
    );
};

export default DataImport;
