import React from 'react';
import { Modal, Button, Form, Table, Spinner, Alert } from 'react-bootstrap';
import { getFormFields, FormField } from '../../config/dataImportConfigs';

interface GenericFormProps {
    fields: FormField[];
    formData: Record<string, any>;
    setFormData: (data: any) => void;
}

const GenericForm: React.FC<GenericFormProps> = ({ fields, formData, setFormData }) => (
    <Form>
        {fields.map(field => (
            <Form.Group className="mb-3" controlId={field.name} key={field.name}>
                <Form.Label className="small fw-bold">{field.label}</Form.Label>
                {field.type === 'boolean' ? (
                    <Form.Check
                        type="checkbox"
                        label={field.label}
                        name={field.name}
                        checked={!!formData[field.name]}
                        onChange={e => setFormData({ ...formData, [field.name]: e.target.checked })}
                    />
                ) : field.type === 'select' ? (
                    <Form.Select
                        name={field.name}
                        size="sm"
                        value={formData[field.name] || ''}
                        onChange={e => setFormData({ ...formData, [field.name]: e.target.value })}
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
                        size="sm"
                        placeholder={`${field.label}を入力`}
                        name={field.name}
                        value={formData[field.name] || ''}
                        onChange={e => setFormData({ ...formData, [field.name]: e.target.value })}
                    />
                )}
            </Form.Group>
        ))}
    </Form>
);

export const RegisterModal = ({ show, onHide, config, formData, setFormData, isLoading, error, onSave }: any) => (
    <Modal show={show} onHide={onHide} size="lg">
        <Modal.Header closeButton><Modal.Title className="fs-5">{config.name} {config.recordId ? '修正' : '登録'}</Modal.Title></Modal.Header>
        <Modal.Body>
            {isLoading ? <div className="text-center p-3"><Spinner animation="border" /></div> : <GenericForm fields={getFormFields(config.type)} formData={formData} setFormData={setFormData} />}
            {error && <Alert variant="danger" className="mt-3 py-2 small">{error}</Alert>}
        </Modal.Body>
        <Modal.Footer>
            <Button variant="secondary" size="sm" onClick={onHide}>閉じる</Button>
            <Button variant="primary" size="sm" onClick={onSave} disabled={isLoading}>保存</Button>
        </Modal.Footer>
    </Modal>
);

export const ListModal = ({ show, onHide, config, listData, isLoading, error, onEdit, onDelete }: any) => (
    <Modal show={show} onHide={onHide} size="xl">
        <Modal.Header closeButton><Modal.Title className="fs-5">{config.name} 一覧</Modal.Title></Modal.Header>
        <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {isLoading && <div className="text-center p-3"><Spinner animation="border" /></div>}
            {!isLoading && listData.rows.length > 0 && (
                <Table striped bordered hover responsive size="sm" className="small">
                    <thead className="table-light">
                        <tr>{listData.headers.map((h: string) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                        {listData.rows.map((row: any) => (
                            <tr key={row[listData.idKey]}>
                                {listData.rowKeys.map((key: string) => <td key={key}>{String(row[key] ?? '')}</td>)}
                                <td className="text-center">
                                    <Button variant="link" size="sm" className="p-0 me-2" onClick={() => onEdit(row[listData.idKey])}>修正</Button>
                                    <Button variant="link" size="sm" className="p-0 text-danger" onClick={() => onDelete(row)}>削除</Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            )}
            {!isLoading && listData.rows.length === 0 && <p className="text-center py-3">データがありません</p>}
            {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" size="sm" onClick={onHide}>閉じる</Button></Modal.Footer>
    </Modal>
);

export const DeleteConfirmModal = ({ show, onHide, item, onConfirm, isLoading }: any) => (
    <Modal show={show} onHide={onHide} centered size="sm">
        <Modal.Header closeButton><Modal.Title className="fs-6 fw-bold">削除の確認</Modal.Title></Modal.Header>
        <Modal.Body className="small">「{item?.displayName}」を削除しますか？</Modal.Body>
        <Modal.Footer>
            <Button variant="secondary" size="sm" onClick={onHide}>キャンセル</Button>
            <Button variant="danger" size="sm" onClick={onConfirm} disabled={isLoading}>削除</Button>
        </Modal.Footer>
    </Modal>
);

export const CsvResultModal = ({ show, onHide, result }: any) => (
    <Modal show={show} onHide={onHide} centered>
        <Modal.Header closeButton><Modal.Title className="fs-5">アップロード結果</Modal.Title></Modal.Header>
        <Modal.Body>
            <Alert variant={result.isError ? 'danger' : 'success'} className="py-2 small">{result.message}</Alert>
            {result.errors.length > 0 && (
                <ul className="small text-danger mb-0">{result.errors.map((err: string, i: number) => <li key={i}>{err}</li>)}</ul>
            )}
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" size="sm" onClick={onHide}>閉じる</Button></Modal.Footer>
    </Modal>
);
