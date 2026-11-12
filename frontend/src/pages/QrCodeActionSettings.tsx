import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Spinner, Alert, Row, Col } from 'react-bootstrap';
import authFetch, { ApiError, apiRequest } from '../utils/api';
import { NavIcon } from '../components/NavIcon';

interface ActionTemplate {
    action_type: string;
    description: string;
    qr_code_pattern: string;
    action_name: string;
    is_active: boolean;
}

interface QrCodeAction extends ActionTemplate {
    id?: number;
    name: string;
}

type FormErrors = Record<string, string | string[] | undefined>;

// 実行内容(action_name)の選択肢。サーバー側の REGISTERED_ACTIONS と対応する
const ACTION_NAME_OPTIONS = [
    { value: 'update_search', label: '検索欄に入力（パターンで抜き出した部分）' },
    { value: 'mark_as_received', label: '入庫としてマーク（仮実装）' },
    { value: 'update_inventory', label: '在庫更新（仮実装）' },
];

const ACTION_TEMPLATES: Record<string, ActionTemplate> = {
    '入庫処理（検索）': {
        action_type: 'regex',
        description: 'QRコードの品番や発注番号を、入庫画面の検索欄にそのまま入力します。',
        qr_code_pattern: '(^ITEM-.+|^PO-.+)',
        action_name: 'update_search',
        is_active: true,
    },
    '出庫処理（検索）': {
        action_type: 'regex',
        description: 'QRコードの受注番号を、出庫画面の検索欄にそのまま入力します。',
        qr_code_pattern: '^SO-.+',
        action_name: 'update_search',
        is_active: true,
    },
};

const QrCodeActionSettings = () => {
    const [actions, setActions] = useState<QrCodeAction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [currentAction, setCurrentAction] = useState<QrCodeAction | null>(null); // null for new, object for edit
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [isSaving, setIsSaving] = useState(false);

    const API_URL = '/api/base/qr-code-actions/';

    const fetchActions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await authFetch(API_URL);
            if (!response.ok) {
                throw new Error(`サーバーエラー: ${response.status}`);
            }
            const data = await response.json();
            setActions(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchActions();
    }, [fetchActions]);

    const handleShowModal = (action: QrCodeAction | null = null) => {
        if (action) {
            // Editing an existing action
            setCurrentAction({ ...action });
        } else {
            // Creating a new action
            const firstTemplateName = Object.keys(ACTION_TEMPLATES)[0];
            setCurrentAction({
                name: firstTemplateName,
                ...ACTION_TEMPLATES[firstTemplateName],
            });
        }
        setFormErrors({});
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setCurrentAction(null);
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;

        // 新規作成時は、アクションの選択に合わせて他の項目をテンプレートで埋める
        if (name === 'name' && !currentAction?.id) {
            const template = ACTION_TEMPLATES[value];
            if (template) {
                setCurrentAction(prev => prev && ({ ...prev, name: value, ...template }));
            }
        } else {
            setCurrentAction(prev => prev && ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        }
    };

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSaving(true);
        setFormErrors({});

        const isNew = !currentAction?.id;
        const url = isNew ? API_URL : `${API_URL}${currentAction?.id}/`;
        const method = isNew ? 'POST' : 'PUT';

        try {
            await apiRequest(url, {
                method: method,
                body: JSON.stringify(currentAction),
            }, '保存に失敗しました。入力内容を確認してください。');
            handleCloseModal();
            fetchActions();
        } catch (err) {
            const fieldErrors = err instanceof ApiError && err.errors ? err.errors : {};
            setFormErrors({ ...(fieldErrors as FormErrors), non_field_errors: err instanceof Error ? err.message : String(err) });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: number | undefined) => {
        if (window.confirm('このアクションを本当に削除しますか？')) {
            try {
                const response = await authFetch(`${API_URL}${id}/`, {
                    method: 'DELETE',
                });
                if (!response.ok) {
                    throw new Error('削除に失敗しました。');
                }
                fetchActions();
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            }
        }
    };

    return (
        <div className="goods-receipt-page">
            <div className="goods-receipt-filter-panel">
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <div className="d-flex align-items-center gap-2">
                        <Button variant="primary" size="sm" className="fw-bold px-3" onClick={() => handleShowModal()}>
                            ＋ 新規アクション作成
                        </Button>
                        <span className="small text-secondary">
                            ※ QRコード読取時、正規表現に一致した最初の有効アクションが実行されます。
                        </span>
                    </div>
                    <span className="receipt-result-count">
                        登録ルール数：<strong>{actions.length}</strong> 件
                    </span>
                </div>
            </div>

            {loading && (
                <div className="text-center py-4">
                    <Spinner animation="border" variant="primary" size="sm" className="me-2" />
                    <span className="text-muted">アクション設定を読み込んでいます...</span>
                </div>
            )}
            {error && <Alert variant="danger">{error}</Alert>}

            {!loading && !error && (
                <div className="goods-receipt-table-card">
                    <Table hover responsive className="goods-receipt-table align-middle mb-0">
                        <thead>
                            <tr>
                                <th>アクション名</th>
                                <th>QRコードパターン (正規表現)</th>
                                <th>説明</th>
                                <th className="text-center">有効状態</th>
                                <th className="text-center" style={{ width: '160px' }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {actions.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-5 text-muted">
                                        登録されているQRコードアクションはありません。
                                    </td>
                                </tr>
                            ) : actions.map(action => (
                                <tr key={action.id}>
                                    <td className="fw-bold text-dark">{action.name}</td>
                                    <td><code className="px-2 py-1 bg-light border rounded text-dark">{action.qr_code_pattern}</code></td>
                                    <td>{action.description}</td>
                                    <td className="text-center">
                                        {action.is_active ? (
                                            <span className="status-mono-badge is-active" title="有効">
                                                <NavIcon name="check-circle" size={15} />
                                                <span>有効</span>
                                            </span>
                                        ) : (
                                            <span className="status-mono-badge is-inactive" title="無効">
                                                <NavIcon name="x-circle" size={15} />
                                                <span>無効</span>
                                            </span>
                                        )}
                                    </td>
                                    <td className="text-center text-nowrap">
                                        <Button variant="outline-primary" size="sm" className="fw-bold" onClick={() => handleShowModal(action)}>編集</Button>
                                        <Button variant="outline-danger" size="sm" className="fw-bold ms-2" onClick={() => handleDelete(action.id)}>削除</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </div>
            )}

            {currentAction &&
                <Modal show={showModal} onHide={handleCloseModal} size="lg" backdrop="static" centered className="mes-clean-modal">
                    <Form onSubmit={handleSave}>
                        <Modal.Header closeButton className="mes-modal-header">
                            <div className="mes-modal-title-wrap">
                                <span className="mes-modal-icon-box" aria-hidden="true">
                                    <NavIcon name="qr-action" size={20} />
                                </span>
                                <div className="mes-modal-title-text">
                                    <div className="mes-modal-title-row">
                                        <Modal.Title className="mes-modal-title">
                                            {currentAction.id ? 'QRコードアクションの編集' : '新規QRコードアクションの作成'}
                                        </Modal.Title>
                                        <span className="mes-modal-tag-pill">QR読取ルール</span>
                                    </div>
                                    <p className="mes-modal-subtitle">
                                        QRコードを読み取った際の判定パターンと実行動作を設定してください。
                                    </p>
                                </div>
                            </div>
                        </Modal.Header>
                        <Modal.Body className="mes-modal-body">
                            {formErrors.non_field_errors && <Alert variant="danger">{formErrors.non_field_errors}</Alert>}

                            <Form.Group as={Row} className="mb-3" controlId="formAction">
                                <Form.Label column sm={3} className="fw-bold">{currentAction.id ? 'アクション名' : 'アクション'}</Form.Label>
                                <Col sm={9}>
                                    {currentAction.id ? (
                                        <div className="fw-bold text-dark py-1">{currentAction.name}</div>
                                    ) : (
                                        <Form.Select name="name" value={currentAction.name} onChange={handleFormChange} isInvalid={!!formErrors.name} required>
                                            {Object.keys(ACTION_TEMPLATES).map(templateName => (
                                                <option key={templateName} value={templateName}>{templateName}</option>
                                            ))}
                                        </Form.Select>
                                    )}
                                    <Form.Control.Feedback type="invalid">{formErrors.name}</Form.Control.Feedback>
                                </Col>
                            </Form.Group>

                            <Form.Group as={Row} className="mb-3" controlId="formActionName">
                                <Form.Label column sm={3} className="fw-bold">実行内容</Form.Label>
                                <Col sm={9}>
                                    <Form.Select name="action_name" value={currentAction.action_name} onChange={handleFormChange} isInvalid={!!formErrors.action_name}>
                                        {ACTION_NAME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </Form.Select>
                                    <Form.Control.Feedback type="invalid">{formErrors.action_name}</Form.Control.Feedback>
                                </Col>
                            </Form.Group>

                            <Form.Group as={Row} className="mb-3" controlId="formDescription">
                                <Form.Label column sm={3} className="fw-bold">説明</Form.Label>
                                <Col sm={9}>
                                    <Form.Control as="textarea" rows={2} name="description" value={currentAction.description} onChange={handleFormChange} isInvalid={!!formErrors.description} />
                                    <Form.Control.Feedback type="invalid">{formErrors.description}</Form.Control.Feedback>
                                </Col>
                            </Form.Group>

                            {(
                                <Form.Group as={Row} className="mb-3" controlId="formPattern">
                                    <Form.Label column sm={3} className="fw-bold">QRコードパターン</Form.Label>
                                    <Col sm={9}>
                                        <Form.Control type="text" name="qr_code_pattern" value={currentAction.qr_code_pattern} onChange={handleFormChange} isInvalid={!!formErrors.qr_code_pattern} required />
                                        <Form.Text className="text-muted">マッチング対象のQRコードの正規表現パターン。例: ^ITEM-.+ 「検索欄に入力」では、括弧( )で囲んだ部分(なければ一致した部分)だけを取り出します。例: ^LOT-(\d{5})-[A-Z]</Form.Text>
                                        <Form.Control.Feedback type="invalid">{formErrors.qr_code_pattern}</Form.Control.Feedback>
                                    </Col>
                                </Form.Group>
                            )}
                            <Form.Group className="mb-1" controlId="formIsActive">
                                <Form.Check type="switch" name="is_active" label="このアクションを有効にする" checked={currentAction.is_active} onChange={handleFormChange} />
                            </Form.Group>
                        </Modal.Body>
                        <Modal.Footer className="mes-modal-footer">
                            <Button variant="outline-secondary" onClick={handleCloseModal}>キャンセル</Button>
                            <Button variant="primary" className="fw-bold px-4" type="submit" disabled={isSaving}>
                                {isSaving ? <><Spinner as="span" animation="border" size="sm" /> 保存中...</> : '保存する'}
                            </Button>
                        </Modal.Footer>
                    </Form>
                </Modal>}
        </div>
    );
};

export default QrCodeActionSettings;