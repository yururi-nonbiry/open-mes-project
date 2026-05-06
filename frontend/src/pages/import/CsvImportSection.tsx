import React, { useState, useCallback } from 'react';
import { Card, Row, Col, Form, Button, ProgressBar } from 'react-bootstrap';
import { useDropzone } from 'react-dropzone';
import { CSV_DATA_TYPES } from '../../config/dataImportConfigs';

interface CsvImportSectionProps {
    isLoading: boolean;
    taskId: string | null;
    taskStatus: string | null;
    progress: number;
    onUpload: (file: File, dataType: string) => void;
    onCancel: () => void;
}

const CsvImportSection: React.FC<CsvImportSectionProps> = ({
    isLoading, taskId, taskStatus, progress, onUpload, onCancel
}) => {
    const [csvDataType, setCsvDataType] = useState('');
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvTemplateUrl, setCsvTemplateUrl] = useState('');

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) setCsvFile(acceptedFiles[0]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
        onDrop, 
        multiple: false, 
        accept: { 'text/csv': ['.csv'] } 
    });

    const handleCsvDataTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const type = e.target.value;
        setCsvDataType(type);
        setCsvTemplateUrl(`/api/base/csv-template/?data_type=${type}`);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (csvFile && csvDataType) {
            onUpload(csvFile, csvDataType);
        }
    };

    return (
        <div className="mt-5">
            <h3>CSVデータ一括登録</h3>
            <p className="text-muted">登録したいデータの種類を選択し、CSVファイルをアップロードしてください。</p>
            <Card className="shadow-sm border-0">
                <Card.Body>
                    <Form onSubmit={handleSubmit}>
                        <Row className="g-3 align-items-end">
                            <Col md={5}>
                                <Form.Label htmlFor="csvDataType" className="fw-bold">データ種類</Form.Label>
                                <Form.Select 
                                    id="csvDataType" value={csvDataType} 
                                    onChange={handleCsvDataTypeChange} 
                                    required disabled={isLoading}
                                >
                                    <option value="" disabled>選択してください...</option>
                                    {CSV_DATA_TYPES.map(type => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </Form.Select>
                            </Col>
                            <Col md={5}>
                                <Form.Label className="fw-bold">CSVファイル</Form.Label>
                                <div {...getRootProps()} className={`dropzone-container p-3 border rounded text-center ${isDragActive ? 'bg-light' : ''}`} style={{ borderStyle: 'dashed', cursor: 'pointer' }}>
                                    <input {...getInputProps()} />
                                    {csvFile ? <p className="mb-0">{csvFile.name}</p> : <p className="mb-0 text-muted small">ファイルをドロップするかクリック</p>}
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
                                <Button variant="link" size="sm" className="text-danger p-0" onClick={onCancel}>キャンセル</Button>
                            </div>
                        </div>
                    )}
                </Card.Body>
            </Card>
        </div>
    );
};

export default CsvImportSection;
