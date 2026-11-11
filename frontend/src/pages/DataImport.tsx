import React, { useState, useEffect } from 'react';
import { Container } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { MASTER_CARDS, BUSINESS_CARDS, DATA_CONFIG, getDataTypeDisplayName } from '../config/dataImportConfigs';
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

    const [searchParams, setSearchParams] = useSearchParams();
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showListModal, setShowListModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<any>(null);

    const handleRegister = (type: string) => {
        setModalConfig({ type, name: getDataTypeDisplayName(type), recordId: null });
        setFormData({});
        setShowRegisterModal(true);
    };

    useEffect(() => {
        const rawTarget = searchParams.get('open');
        if (!rawTarget) return;
        const normalized = rawTarget === 'production_plan' ? 'production-plan' : rawTarget;
        if (DATA_CONFIG[normalized]) {
            handleRegister(normalized);
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('open');
            setSearchParams(nextParams, { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const handleList = (type: string) => {
        setModalConfig({ type, name: getDataTypeDisplayName(type) });
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
        <Container className="py-2">
            <div className="data-import-usage-modes mb-4">
                <div className="usage-mode-card mode-external">
                    <div className="usage-mode-header">
                        <span className="mode-pill external">他アプリを使う場合</span>
                        <span className="usage-mode-short-desc">入庫予定・出庫予定・BOMは自動同期。生産計画のみここで作成します。</span>
                    </div>
                    <div className="d-flex flex-wrap gap-2 mt-2">
                        <button
                            type="button"
                            className="btn btn-sm btn-primary fw-bold"
                            onClick={() => handleRegister('production-plan')}
                        >
                            ① 生産計画を作成
                        </button>
                        <Link to="/production/plan" className="btn btn-sm btn-outline-primary fw-bold">
                            ② 生産計画（材料引当）へ →
                        </Link>
                    </div>
                </div>
                <div className="usage-mode-card mode-standalone">
                    <div className="usage-mode-header">
                        <span className="mode-pill standalone">他アプリを使わない場合</span>
                        <span className="usage-mode-short-desc">順番にボタンを押してマスタ登録、または下部のCSVで一括登録します。</span>
                    </div>
                    <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary fw-bold bg-white"
                            onClick={() => handleRegister('warehouse')}
                        >
                            ① 倉庫登録
                        </button>
                        <span className="text-muted fw-bold">→</span>
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary fw-bold bg-white"
                            onClick={() => handleRegister('item')}
                        >
                            ② 品番登録
                        </button>
                        <span className="text-muted fw-bold">→</span>
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary fw-bold bg-white"
                            onClick={() => handleRegister('supplier')}
                        >
                            ③ 仕入先登録
                        </button>
                        <span className="text-muted fw-bold">→</span>
                        <Link to="/production/bom-master" className="btn btn-sm btn-outline-primary fw-bold bg-white">
                            ④ 使用部品マスターへ →
                        </Link>
                    </div>
                </div>
            </div>

            <DataCardList 
                title="業務データ" 
                cards={BUSINESS_CARDS} 
                onRegister={handleRegister} 
                onList={handleList} 
            />

            <DataCardList 
                title="マスターデータ" 
                cards={MASTER_CARDS} 
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
                onOpenRegister={() => {
                    setShowListModal(false);
                    handleRegister(modalConfig.type);
                }}
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
