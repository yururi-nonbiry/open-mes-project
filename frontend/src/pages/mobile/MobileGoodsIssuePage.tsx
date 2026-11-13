import { useState, useEffect, useRef, useCallback } from 'react';
import WarehouseLocationMapModal from '../inventory/WarehouseLocationMapModal';
import { Container, Form, Button, Row, Col, Card, Badge, Modal, Spinner, Alert, Pagination as BootstrapPagination, InputGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import authFetch, { handleError } from '../../utils/api';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import inventoryService, { SalesOrder, validateIssueQuantity } from '../../services/inventoryService';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import CameraIcon from '../../components/common/CameraIcon';
import './MobileLocationTransferPage.css'; // スタイルを再利用
import type { FormEvent } from 'react';
import { errorMessage } from './mobileTypes';
import { useScheduleDateDefaults } from '../../hooks/useScheduleDateDefaults';
import type { ScheduleDateDefaults } from '../../services/scheduleDateDefaultsService';
import type { CameraState, MobileMessage, QrActionResponse, ScanTargetSetter } from './mobileTypes';

const MobileGoodsIssuePageContent = ({ dateDefaults }: { dateDefaults: ScheduleDateDefaults }) => {
    // State for data and UI
    const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // State for search inputs
    const [searchQueryInput, setSearchQueryInput] = useState('');
    const [searchStatusInput, setSearchStatusInput] = useState('pending');
    const [dateFromInput, setDateFromInput] = useState(dateDefaults.from);
    const [dateToInput, setDateToInput] = useState(dateDefaults.to);
    const [groupByLine, setGroupByLine] = useState(false);
    const workCenters = useWorkCenters();

    // State for committed search params that trigger fetch
    const [committedSearchParams, setCommittedSearchParams] = useState({ q: '', status: 'pending', from: dateDefaults.from, to: dateDefaults.to });

    // State for pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const pageSize = 25;

    // 出庫元ロケーション地図
    const [mapOrderId, setMapOrderId] = useState<string | number | null>(null);

    // State for modal
    const [showModal, setShowModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
    const [quantityToShip, setQuantityToShip] = useState('');
    const [modalMessage, setModalMessage] = useState<MobileMessage>({ text: '', type: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // カメラの状態
    const [cameraState, setCameraState] = useState<CameraState>({
        isOpen: false,
        targetSetter: null,
    });
    const videoRef = useRef<HTMLVideoElement>(null);
    const codeReader = useRef(new BrowserMultiFormatReader());

    const navigate = useNavigate();

    const fetchSalesOrders = useCallback(async (page: number, query: string, status: string, from: string, to: string, grouped: boolean) => {
        setLoading(true);
        setError(null);
        
        try {
            const data = await inventoryService.getIssuableSalesOrders({ page, pageSize, q: query, status, expectedFrom: from, expectedTo: to, groupByLine: grouped });
            setSalesOrders(data.results || []);
            setTotalPages(data.total_pages || 0);
            setTotalCount(data.count || 0);
        } catch (e) {
            setError(errorMessage(e));
            setSalesOrders([]);
            setTotalPages(0);
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    }, [pageSize]);

    // Effect to fetch data when page or committed search params change
    useEffect(() => {
        fetchSalesOrders(currentPage, committedSearchParams.q, committedSearchParams.status, committedSearchParams.from, committedSearchParams.to, groupByLine);
    }, [currentPage, committedSearchParams, groupByLine, fetchSalesOrders]);

    // --- Camera Scan Logic ---
    const startCameraScan = (targetSetter: ScanTargetSetter) => {
        setCameraState({ isOpen: true, targetSetter: targetSetter });
    };

    const stopCameraScan = useCallback(() => {
        setCameraState({ isOpen: false, targetSetter: null });
    }, []);

    useEffect(() => {
        if (cameraState.isOpen && videoRef.current) {
            codeReader.current
                .decodeFromVideoDevice(null, videoRef.current,
                    (result, error) => {
                        if (result) {
                            // Successful scan, stop the camera
                            setCameraState({ isOpen: false, targetSetter: null });
                            handleQrCodeResult(result.getText(), cameraState.targetSetter);
                        }
                        if (error && !(error instanceof NotFoundException)) {
                            console.error(error);
                            setError('バーコードの読み取りに失敗しました。');
                            setCameraState({ isOpen: false, targetSetter: null });
                        }
                    }
                )
                .catch(err => {
                    console.error(err);
                    setError('カメラの起動に失敗しました。');
                    setCameraState({ isOpen: false, targetSetter: null });
                });
        }
        codeReader.current.reset();
    // handleQrCodeResult はこの後で定義されるため依存配列に含められない
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cameraState.isOpen, cameraState.targetSetter, setError]);
    
    const handleOpenModal = useCallback((order: SalesOrder) => {
        setSelectedOrder(order);
        setQuantityToShip(order.remaining_quantity > 0 ? String(order.remaining_quantity) : '1');
        setModalMessage({ text: '', type: '' });
        setIsSubmitting(false);
        setShowModal(true);
    }, []);

    const handleQrCodeResult = useCallback(async (decodedText: string, defaultSetter: ScanTargetSetter | null) => {
        setLoading(true);
        setError(null);

        try {
            const response = await authFetch('/api/base/qr-code-actions/execute/', {
                method: 'POST',
                body: JSON.stringify({ qr_data: decodedText }),
            });

            if (response.status === 404) {
                if (defaultSetter) defaultSetter(decodedText);
                return;
            }

            await handleError(response, `サーバーエラー: ${response.status}`);

            const data: QrActionResponse<SalesOrder> = await response.json();
            const { action, payload, navigate: navTarget, state, updateSearch } = data.result || {};

            let handled = false;
            if (action) {
                switch (action) {
                    case 'goods_issue':
                        if (payload) {
                            handleOpenModal(payload);
                            handled = true;
                        }
                        break;
                    case 'navigate':
                        if (navTarget) {
                            navigate(navTarget, { state });
                            handled = true;
                        }
                        break;
                    case 'update_search':
                        if (updateSearch) {
                            setSearchQueryInput(updateSearch);
                            setCommittedSearchParams(prev => ({ ...prev, q: updateSearch, status: searchStatusInput }));
                            setCurrentPage(1);
                            handled = true;
                        }
                        break;
                }
            }

            // Fallback for older action format
            if (!handled && updateSearch) {
                setSearchQueryInput(updateSearch);
                setCommittedSearchParams(prev => ({ ...prev, q: updateSearch, status: searchStatusInput }));
                setCurrentPage(1);
                handled = true;
            }

            if (!handled && defaultSetter) defaultSetter(decodedText);
        } catch (err) {
            setError(`QRコード処理エラー: ${errorMessage(err)}`);
        } finally {
            setLoading(false);
        }
    }, [navigate, searchStatusInput, handleOpenModal]);
    
    const handleSearch = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setCurrentPage(1);
        setCommittedSearchParams({ q: searchQueryInput, status: searchStatusInput, from: dateFromInput, to: dateToInput });
    };

    const handleReset = () => {
        setSearchQueryInput('');
        setSearchStatusInput('pending');
        setDateFromInput(dateDefaults.from);
        setDateToInput(dateDefaults.to);
        setGroupByLine(false);
        setCurrentPage(1);
        setCommittedSearchParams({ q: '', status: 'pending', from: dateDefaults.from, to: dateDefaults.to });
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setSelectedOrder(null);
    };

    const handleIssueSubmit = async () => {
        if (!selectedOrder) return;

        setModalMessage({ text: '', type: '' });
        const validationError = validateIssueQuantity(quantityToShip, selectedOrder.remaining_quantity);
        if (validationError) {
            setModalMessage({ text: validationError, type: 'danger' });
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await inventoryService.issueSalesOrder(selectedOrder.id, parseInt(quantityToShip, 10));

            if (result.ok) {
                setModalMessage({ text: result.message, type: 'success' });
                setTimeout(() => {
                    handleCloseModal();
                    // Re-fetch data for the current page
                    fetchSalesOrders(currentPage, committedSearchParams.q, committedSearchParams.status, committedSearchParams.from, committedSearchParams.to, groupByLine);
                }, 1500);
            } else {
                setModalMessage({ text: result.message, type: 'danger' });
            }
        } catch (err) {
            console.error('Error processing issue:', err);
            setModalMessage({ text: '通信エラーが発生しました。', type: 'danger' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const renderPaginationInfo = () => {
        if (loading && !salesOrders.length) return '読み込み中...';
        if (error) return <span className="text-danger">エラーが発生しました</span>;
        if (totalCount === 0) return '該当する出庫予定はありません。';
        const startItem = (currentPage - 1) * pageSize + 1;
        const endItem = Math.min(startItem + pageSize - 1, totalCount);
        return `全 ${totalCount} 件中 ${startItem} - ${endItem} 件を表示 (ページ ${currentPage} / ${totalPages})`;
    };

    const renderPaginationControls = () => {
        if (totalPages <= 1) return null;
        
        const items = [];
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);

        for (let number = startPage; number <= endPage; number++) {
            items.push(
                <BootstrapPagination.Item key={number} active={number === currentPage} onClick={() => setCurrentPage(number)}>
                    {number}
                </BootstrapPagination.Item>
            );
        }

        return (
            <BootstrapPagination className="justify-content-center">
                <BootstrapPagination.Prev onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} />
                {items}
                <BootstrapPagination.Next onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} />
            </BootstrapPagination>
        );
    };

  return (
    <Container>
        <h1 className="mb-3">出庫処理</h1>

        <div id="search-criteria-area" className="mb-3 p-3 border rounded bg-light">
            <Form onSubmit={handleSearch}>
                <Row className="g-2 mb-2">
                    <Col md={9} xs={12}>
                        <Form.Group controlId="search-q">
                            <Form.Label className="form-label-sm">検索 (受注番号/品番/倉庫):</Form.Label>
                            <InputGroup size="sm">
                                <Form.Control
                                    type="text"
                                    placeholder="受注番号, 品番, 倉庫で検索"
                                    value={searchQueryInput}
                                    onChange={(e) => setSearchQueryInput(e.target.value)}
                                />
                                <Button variant="outline-secondary" type="button" onClick={() => startCameraScan(setSearchQueryInput)} title="カメラでスキャン" aria-label="カメラでスキャン"><CameraIcon /></Button>
                            </InputGroup>
                        </Form.Group>
                    </Col>
                    <Col md={3} xs={12}>
                        <Form.Group controlId="search-status">
                            <Form.Label className="form-label-sm">ステータス:</Form.Label>
                            <Form.Select
                                size="sm"
                                value={searchStatusInput}
                                onChange={(e) => setSearchStatusInput(e.target.value)}
                            >
                                <option value="">すべて</option>
                                <option value="pending">未出庫 (Pending)</option>
                                <option value="shipped">出庫済み (Shipped)</option>
                                <option value="canceled">キャンセル (Canceled)</option>
                            </Form.Select>
                        </Form.Group>
                    </Col>
                </Row>
                <Row className="g-2 mb-2">
                    <Col xs={6}>
                        <Form.Group controlId="search-date-from">
                            <Form.Label className="form-label-sm">出庫予定日(開始):</Form.Label>
                            <Form.Control size="sm" type="date" value={dateFromInput} onChange={(e) => setDateFromInput(e.target.value)} />
                        </Form.Group>
                    </Col>
                    <Col xs={6}>
                        <Form.Group controlId="search-date-to">
                            <Form.Label className="form-label-sm">出庫予定日(終了):</Form.Label>
                            <Form.Control size="sm" type="date" value={dateToInput} onChange={(e) => setDateToInput(e.target.value)} />
                        </Form.Group>
                    </Col>
                </Row>
                <Form.Check
                    className="mb-2"
                    type="checkbox"
                    id="group-by-line"
                    label="ラインごとにまとめて表示"
                    checked={groupByLine}
                    onChange={(e) => { setGroupByLine(e.target.checked); setCurrentPage(1); }}
                />
                <Row className="g-2">
                    <Col xs={6}>
                        <Button variant="secondary" className="w-100" type="button" onClick={handleReset}>リセット</Button>
                    </Col>
                    <Col xs={6}>
                        <Button variant="primary" type="submit" className="w-100">検索</Button>
                    </Col>
                </Row>
            </Form>
        </div>

        <p className="text-muted">{renderPaginationInfo()}</p>

        <div id="sales-order-list" className="list-container">
            {loading && !salesOrders.length ? (
                <div className="text-center"><Spinner animation="border" /></div>
            ) : error ? (
                <Alert variant="danger">{error}</Alert>
            ) : salesOrders.length > 0 ? (
                salesOrders.map((order, index) => {
                  const lineCode = order.line || '';
                  const showLineHeader = groupByLine && (index === 0 || (salesOrders[index - 1].line || '') !== lineCode);
                  const lineName = workCenters.find(w => w.code === lineCode)?.name;
                  return (
                    <div key={order.id}>
                    {showLineHeader && (
                        <h6 className="bg-secondary text-white rounded px-2 py-1 mb-2">
                            {lineCode ? `${lineCode}${lineName ? `（${lineName}）` : ''}` : '出庫先ライン未指定'}
                        </h6>
                    )}
                    <Card className="mb-3">
                        <Card.Header className="d-flex justify-content-between align-items-center">
                            <h5 className="mb-0">{order.order_number || 'N/A'}</h5>
                            <Badge bg="info" text="dark">{order.status_display || ''}</Badge>
                        </Card.Header>
                        <Card.Body>
                            <p className="card-text mb-2">
                                <strong>品番:</strong> {order.item || 'N/A'}<br />
                                <strong>倉庫:</strong> {order.warehouse || 'N/A'}<br />
                                <strong>用途:</strong> {order.purpose || '汎用'}
                            </p>
                            <Row className="text-center border-top border-bottom py-2">
                                <Col>
                                    <small className="text-muted d-block">予定</small>
                                    <span className="fs-5 fw-bold">{order.quantity}</span>
                                </Col>
                                <Col>
                                    <small className="text-muted d-block">出庫済</small>
                                    <span className="fs-5 fw-bold">{order.shipped_quantity}</span>
                                </Col>
                                <Col>
                                    <small className="text-muted d-block">残</small>
                                    <span className="fs-5 fw-bold text-danger">{order.remaining_quantity}</span>
                                </Col>
                            </Row>
                            <p className="card-text mt-2 mb-0">
                                <small className="text-muted">
                                    出庫予定日: {order.expected_shipment ? new Date(order.expected_shipment).toLocaleDateString() : '未定'}
                                </small>
                            </p>
                        </Card.Body>
                        <Card.Footer className="bg-white border-0 p-2">
                            <Button variant="outline-secondary" className="w-100 mb-2" onClick={() => setMapOrderId(order.id)}>
                                地図で確認
                            </Button>
                            <Button
                                variant="success"
                                className="w-100"
                                onClick={() => handleOpenModal(order)}
                                disabled={order.remaining_quantity <= 0 || order.status !== 'pending'}
                            >
                                出庫処理
                            </Button>
                        </Card.Footer>
                    </Card>
                    </div>
                  );
                })
            ) : (
                <Alert variant="secondary" className="text-center">データがありません。</Alert>
            )}
        </div>
        
        <div id="pagination-controls" className="d-flex justify-content-center mt-3">
            {renderPaginationControls()}
        </div>

        <WarehouseLocationMapModal isOpen={mapOrderId !== null} onClose={() => setMapOrderId(null)} orderId={mapOrderId} />

        {/* Issue Modal */}
        <Modal show={showModal} onHide={handleCloseModal} centered>
            <Modal.Header closeButton>
                <Modal.Title>出庫処理</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {selectedOrder && (
                    <Form onSubmit={(e) => { e.preventDefault(); handleIssueSubmit(); }}>
                        <Form.Group className="mb-3">
                            <Form.Label>受注番号:</Form.Label>
                            <Form.Control type="text" defaultValue={selectedOrder.order_number} readOnly />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>品番:</Form.Label>
                            <Form.Control type="text" defaultValue={selectedOrder.item ?? undefined} readOnly />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>倉庫:</Form.Label>
                            <Form.Control type="text" defaultValue={selectedOrder.warehouse ?? undefined} readOnly />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>残数量:</Form.Label>
                            <Form.Control type="number" defaultValue={selectedOrder.remaining_quantity} readOnly />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>今回出庫数量:</Form.Label>
                            <Form.Control
                                type="number"
                                value={quantityToShip}
                                onChange={(e) => setQuantityToShip(e.target.value)}
                                min="1"
                                max={selectedOrder.remaining_quantity}
                                required
                                autoFocus
                            />
                        </Form.Group>
                    </Form>
                )}
                {modalMessage.text && (
                    <Alert variant={modalMessage.type} className="mt-3">{modalMessage.text}</Alert>
                )}
            </Modal.Body>
            <Modal.Footer className="justify-content-center gap-2">
                <Button variant="secondary" className="btn-lg flex-fill" onClick={handleCloseModal} disabled={isSubmitting}>
                    キャンセル
                </Button>
                <Button variant="primary" className="btn-lg flex-fill" onClick={handleIssueSubmit} disabled={isSubmitting}>
                    {isSubmitting ? <><Spinner as="span" animation="border" size="sm" /> 処理中...</> : '出庫実行'}
                </Button>
            </Modal.Footer>
        </Modal>

        {/* Camera View */}
        {cameraState.isOpen && (
            <div className="camera-view-container">
                <video ref={videoRef} className="camera-video-element"></video>
                <div className="camera-targeting-guide"></div>
                <button onClick={stopCameraScan} className="btn btn-danger close-camera-button">&times; 閉じる</button>
            </div>
        )}
    </Container>
  );
};

// 予定日フィルタの初期値(管理者設定。入庫・出庫共通)の取得を待ってから画面を描画する
const MobileGoodsIssuePage = () => {
  const dateDefaults = useScheduleDateDefaults();
  if (!dateDefaults) return <div className="p-4 text-center text-muted">読み込み中...</div>;
  return <MobileGoodsIssuePageContent dateDefaults={dateDefaults} />;
};

export default MobileGoodsIssuePage;