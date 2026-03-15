import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Row, Col, Card, Button, Modal, Form, Table, Spinner, Alert, ProgressBar } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import authFetch from '../utils/api';
import { useDropzone } from 'react-dropzone';
import {
    DATA_CONFIG,
    getFormFields,
    getTableConfig,
    MASTER_CARDS,
    BUSINESS_CARDS,
    CSV_DATA_TYPES,
    FormField,
} from '../config/dataImportConfigs';

interface GenericFormProps {
    fields: FormField[];
    formData: Record<string, any>;
    setFormData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}

const GenericForm: React.FC<GenericFormProps> = ({ fields, formData, setFormData }) => (
    <Form>
        {fields.map(field => (
            <Form.Group className="mb-3" controlId={field.name} key={field.name}>
                <Form.Label>{field.label}</Form.Label>
                {field.type === 'boolean' ? (
                    <Form.Check
                        type="checkbox"
                        label={field.label}
                        name={field.name}
                        checked={!!formData[field.name]}
                        onChange={e => setFormData(prev => ({ ...prev, [field.name]: e.target.checked }))}
                    />
                ) : field.type === 'select' ? (
                    <Form.Select
                        name={field.name}
                        value={formData[field.name] || ''}
                        onChange={e => setFormData(prev => ({ ...prev, [field.name]: e.target.value }))}
                    >
                        <option value="">選択してください</option>
                        {(field as any).options?.map((option: any) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </Form.Select>
                ) : (
                    <Form.Control
                        type={field.type || 'text'}
                        placeholder={`${field.label}を入力`}
                        name={field.name}
                        value={formData[field.name] || ''}
                        onChange={e => setFormData(prev => ({ ...prev, [field.name]: e.target.value }))}
                    />
                )}
            </Form.Group>
        ))}
    </Form>
);

interface ModalConfig {
    type: string;
    name: string;
    recordId?: string | number | null;
}

interface ListData {
    headers: string[];
    rows: Record<string, any>[];
    rowKeys: string[];
    idKey: string;
}

interface CsvResult {
    message: string;
    isError: boolean;
    errors: string[];
}

interface ItemToDelete {
    id: string | number;
    type: string;
    displayName: string;
}

const DataImport: React.FC = () => {
    // State for modals
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showListModal, setShowListModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showCsvResultModal, setShowCsvResultModal] = useState(false);

    // State for modal content
    const [modalConfig, setModalConfig] = useState<ModalConfig>({ type: '', name: '', recordId: null });
    const [listData, setListData] = useState<ListData>({ headers: [], rows: [], rowKeys: [], idKey: 'id' });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [itemToDelete, setItemToDelete] = useState<ItemToDelete | null>(null);
    const [csvResult, setCsvResult] = useState<CsvResult>({ message: '', isError: false, errors: [] });

    // CSV非同期アップロード関連のState
    const [taskId, setTaskId] = useState<string | null>(null);
    const [taskStatus, setTaskStatus] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);

    // State for CSV Upload
    const [csvDataType, setCsvDataType] = useState('');
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvTemplateUrl, setCsvTemplateUrl] = useState('');

    const fetchListData = useCallback(async (type: string) => {
        if (!type || !DATA_CONFIG[type]) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await authFetch(DATA_CONFIG[type].listUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            const result = await response.json();
            const rows = result.results || result.data || [];

            const config = getTableConfig(type);
            setListData({
                headers: [...config.map(c => c.label), '操作'],
                rowKeys: config.map(c => c.name),
                rows: rows,
                idKey: 'id'
            });
        } catch (e: any) {
            setError(e.message);
            setListData(prev => ({ ...prev, rows: [] }));
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleShowRegisterModal = useCallback(async (type: string, recordId: string | number | null = null) => {
        const config = DATA_CONFIG[type];
        if (!config) return;
        setModalConfig({ type, name: config.name, recordId });
        setFormData({});
        if (recordId) {
            setIsLoading(true);
            setError(null);
            try {
                const response = await authFetch(config.detailUrl(recordId));
                if (!response.ok) throw new Error('Failed to fetch record details.');
                const result = await response.json();
                setFormData(result.data || result);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setIsLoading(false);
            }
        }
        setShowRegisterModal(true);
    }, []);

    const handleShowListModal = useCallback((type: string) => {
        if (!DATA_CONFIG[type]) return;
        setModalConfig({ type, name: DATA_CONFIG[type].name });
        setShowListModal(true);
    }, []);

    useEffect(() => {
        if (!showListModal || !modalConfig.type) return;
        fetchListData(modalConfig.type);
    }, [showListModal, modalConfig.type, fetchListData]);

    const handleFormSubmit = async () => {
        const { type, recordId } = modalConfig;
        const config = DATA_CONFIG[type];
        setIsLoading(true);
        setError(null);
        try {
            const url = recordId ? config.detailUrl(recordId) : config.createUrl;
            const method = recordId ? 'PUT' : 'POST';
            const response = await authFetch(url, {
                method,
                body: JSON.stringify(formData),
            });
            if (!response.ok) throw new Error('Failed to save record.');
            setShowRegisterModal(false);
            if (showListModal) fetchListData(type);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!itemToDelete) return;
        const { type, id } = itemToDelete;
        const config = DATA_CONFIG[type];
        setIsLoading(true);
        try {
            const response = await authFetch(config.deleteUrl(id), { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete record.');
            setShowDeleteModal(false);
            fetchListData(type);
        } catch (e: any) {
            alert(`削除に失敗しました: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCsvUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!csvFile || !csvDataType) return;
        setIsLoading(true);
        const formDataObj = new FormData();
        formDataObj.append('file', csvFile);
        formDataObj.append('data_type', csvDataType);

        try {
            const response = await authFetch('/api/base/csv-import/', {
                method: 'POST',
                body: formDataObj,
            });
            const result = await response.json();
            if (result.task_id) {
                setTaskId(result.task_id);
                startPolling(result.task_id);
            } else {
                setCsvResult({ message: result.message || 'アップロードに失敗しました', isError: true, errors: result.errors || [] });
                setShowCsvResultModal(true);
                setIsLoading(false);
            }
        } catch (e: any) {
            setCsvResult({ message: '通信エラーが発生しました', isError: true, errors: [e.message] });
            setShowCsvResultModal(true);
            setIsLoading(false);
        }
    };

    const startPolling = (currentTaskId: string) => {
        pollingInterval.current = setInterval(async () => {
            try {
                const response = await authFetch(`/api/base/async-tasks/${currentTaskId}/`);
                const result = await response.json();
                setTaskStatus(result.status_display);
                setProgress(result.progress || 0);

                if (result.status === 'SUCCESS') {
                    stopPolling();
                    setCsvResult({ message: 'インポートが完了しました', isError: false, errors: [] });
                    setShowCsvResultModal(true);
                    setIsLoading(false);
                } else if (result.status === 'FAILURE') {
                    stopPolling();
                    setCsvResult({ message: 'インポート中にエラーが発生しました', isError: true, errors: [result.error_message || '不明なエラー'] });
                    setShowCsvResultModal(true);
                    setIsLoading(false);
                }
            } catch (e) {
                stopPolling();
                setIsLoading(false);
            }
        }, 2000);
    };

    const stopPolling = () => {
        if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
        }
        setTaskId(null);
    };

    const handleCancelUpload = () => {
        stopPolling();
        setIsLoading(false);
    };

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) setCsvFile(acceptedFiles[0]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false, accept: { 'text/csv': ['.csv'] } });

    const handleCsvDataTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const type = e.target.value;
        setCsvDataType(type);
        setCsvTemplateUrl(`/api/base/csv-template/?data_type=${type}`);
    };

    const handleTemplateDownload = (e: React.MouseEvent) => {
        if (!csvTemplateUrl) e.preventDefault();
    };

    const renderCard = (cardInfo: any) => (
        <Col key={cardInfo.id} md={4} className="mb-4">
            <Card className="h-100 shadow-sm">
                <Card.Body className="d-flex flex-column">
                    <div className="d-flex align-items-center mb-3">
                        <span className="fs-2 me-3">{cardInfo.icon}</span>
                        <Card.Title className="mb-0">{cardInfo.title}</Card.Title>
                    </div>
                    <Card.Text className="flex-grow-1 text-muted small">{cardInfo.description}</Card.Text>
                    <div className="d-grid gap-2 mt-3">
                        <Button variant="outline-primary" size="sm" onClick={() => handleShowRegisterModal(cardInfo.id)}>新規作成</Button>
                        <Button variant="outline-secondary" size="sm" onClick={() => handleShowListModal(cardInfo.id)}>一覧表示</Button>
                    </div>
                </Card.Body>
            </Card>
        </Col>
    );

    return (
        <Container className="py-5">
            <h2 className="mb-4">データインポート・管理</h2>
            <p className="text-muted mb-5">システムの基盤となるマスターデータや、日々の業務データを管理・インポートします。</p>

            <h3>マスターデータ</h3>
            <Row>{MASTER_CARDS.map(card => renderCard(card))}</Row>

            <h3 className="mt-5">業務データ</h3>
            <Row>{BUSINESS_CARDS.map(card => renderCard(card))}</Row>

            <h3 className="mt-5">CSVデータ一括登録</h3>
            <p>登録したいデータの種類を選択し、CSVファイルをアップロードしてください。</p>
            <Card className="mb-5">
                <Card.Body>
                    <Form onSubmit={handleCsvUpload}>
                        <Row className="g-3 align-items-end">
                            <Col md={5}>
                                <Form.Label htmlFor="csvDataType">データ種類</Form.Label>
                                <Form.Select id="csvDataType" value={csvDataType} onChange={handleCsvDataTypeChange} required disabled={isLoading}>
                                    <option value="" disabled>選択してください...</option>
                                    {CSV_DATA_TYPES.map(type => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </Form.Select>
                            </Col>
                            <Col md={5}>
                                <Form.Label>CSVファイル</Form.Label>
                                <div {...getRootProps()} className={`dropzone-container ${isDragActive ? 'active' : ''}`}>
                                    <input {...getInputProps()} />
                                    {csvFile ? <p className="mb-0">{csvFile.name}</p> : <p className="mb-0 text-muted">ファイルをドロップするかクリック</p>}
                                </div>
                            </Col>
                            <Col md={2}>
                                <Button type="submit" variant="success" className="w-100" disabled={!csvDataType || !csvFile || isLoading}>
                                    アップロード
                                </Button>
                            </Col>
                        </Row>
                        {csvTemplateUrl && (
                            <div className="mt-2 text-end">
                                <a href={csvTemplateUrl} className="small text-decoration-none">テンプレートCSVのダウンロード</a>
                            </div>
                        )}
                    </Form>
                    {taskId && (
                        <div className="mt-4">
                            <ProgressBar animated now={progress} label={`${progress}%`} />
                            <div className="d-flex justify-content-between mt-1">
                                <small className="text-muted">{taskStatus}</small>
                                <Button variant="link" size="sm" className="text-danger p-0" onClick={handleCancelUpload}>キャンセル</Button>
                            </div>
                        </div>
                    )}
                </Card.Body>
            </Card>

            {/* Modals */}
            <Modal show={showRegisterModal} onHide={() => setShowRegisterModal(false)} size="lg">
                <Modal.Header closeButton><Modal.Title>{modalConfig.name} {modalConfig.recordId ? '修正' : '登録'}</Modal.Title></Modal.Header>
                <Modal.Body>
                    {isLoading ? <Spinner animation="border" /> : <GenericForm fields={getFormFields(modalConfig.type)} formData={formData} setFormData={setFormData} />}
                    {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowRegisterModal(false)}>閉じる</Button>
                    <Button variant="primary" onClick={handleFormSubmit}>保存</Button>
                </Modal.Footer>
            </Modal>

            <Modal show={showListModal} onHide={() => setShowListModal(false)} size="xl">
                <Modal.Header closeButton><Modal.Title>{modalConfig.name} 一覧</Modal.Title></Modal.Header>
                <Modal.Body>
                    {isLoading && <div className="text-center"><Spinner animation="border" /></div>}
                    {!isLoading && listData.rows.length > 0 && (
                        <Table striped bordered hover responsive size="sm">
                            <thead>
                                <tr>{listData.headers.map(h => <th key={h}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                                {listData.rows.map(row => (
                                    <tr key={row[listData.idKey]}>
                                        {listData.rowKeys.map(key => <td key={key}>{String(row[key] ?? '')}</td>)}
                                        <td>
                                            <Button variant="link" size="sm" onClick={() => { setShowListModal(false); handleShowRegisterModal(modalConfig.type, row[listData.idKey]); }}>修正</Button>
                                            <Button variant="link" size="sm" className="text-danger" onClick={() => {
                                                setItemToDelete({ id: row[listData.idKey], type: modalConfig.type, displayName: row.name || row.code || `ID: ${row[listData.idKey]}` });
                                                setShowDeleteModal(true);
                                            }}>削除</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    )}
                    {!isLoading && listData.rows.length === 0 && <p className="text-center">データがありません</p>}
                    {error && <Alert variant="danger">{error}</Alert>}
                </Modal.Body>
            </Modal>

            <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
                <Modal.Header closeButton><Modal.Title>削除の確認</Modal.Title></Modal.Header>
                <Modal.Body>「{itemToDelete?.displayName}」を削除しますか？</Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>キャンセル</Button>
                    <Button variant="danger" onClick={handleDeleteConfirm}>削除</Button>
                </Modal.Footer>
            </Modal>

            <Modal show={showCsvResultModal} onHide={() => setShowCsvResultModal(false)}>
                <Modal.Header closeButton><Modal.Title>アップロード結果</Modal.Title></Modal.Header>
                <Modal.Body>
                    <Alert variant={csvResult.isError ? 'danger' : 'success'}>{csvResult.message}</Alert>
                    {csvResult.errors.length > 0 && (
                        <ul>{csvResult.errors.map((err, i) => <li key={i}>{err}</li>)}</ul>
                    )}
                </Modal.Body>
                <Modal.Footer><Button variant="secondary" onClick={() => setShowCsvResultModal(false)}>閉じる</Button></Modal.Footer>
            </Modal>
        </Container>
    );
};

export default DataImport;
