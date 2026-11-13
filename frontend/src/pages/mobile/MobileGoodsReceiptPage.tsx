import { useState, useEffect, useCallback, useRef } from 'react';
import { applyShelfInput } from '../../utils/shelfQr';
import authFetch, { ApiError, handleError } from '../../utils/api';
import inventoryService from '../../services/inventoryService';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { useStockPurposes } from '../../hooks/useStockPurposes';
import { useScheduleDateDefaults } from '../../hooks/useScheduleDateDefaults';
import type { ScheduleDateDefaults } from '../../services/scheduleDateDefaultsService';
import ReceiptLocationMap from '../../components/common/ReceiptLocationMap';
import CameraIcon from '../../components/common/CameraIcon';
import './MobileGoodsReceiptPage.css';
import './MobileLocationTransferPage.css'; // スタイルを再利用
import type { ChangeEvent, FormEvent } from 'react';
import type { PurchaseOrderRow, CellValue } from '../types/listPage';
import { errorMessage } from './mobileTypes';
import type { CameraState, QrActionResponse, ScanTargetSetter } from './mobileTypes';

// 発注の残数量(数量 - 入庫済数量)
const remainingOf = (order: PurchaseOrderRow) => (order.quantity ?? 0) - (order.received_quantity ?? 0);

const MobileGoodsReceiptPageContent = ({ dateDefaults }: { dateDefaults: ScheduleDateDefaults }) => {
  // State for purchase orders, loading/error status
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for search
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState(dateDefaults.from);
  const [dateTo, setDateTo] = useState(dateDefaults.to);

  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // State for the receipt processing form (acting as a modal)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderRow | null>(null);
  const [receiptFormData, setReceiptFormData] = useState({ received_quantity: '', location: '', warehouse: '', purpose: '' });
  const stockPurposes = useStockPurposes();
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // カメラの状態
  const [cameraState, setCameraState] = useState<CameraState>({
    isOpen: false,
    targetSetter: null,
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReader = useRef(new BrowserMultiFormatReader());


  // API call to fetch purchase order data
  const fetchPurchaseOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (searchTerm) {
      // General search for mobile view
      params.append('search_q', searchTerm);
    }
    if (dateFrom) params.append('search_expected_arrival_from', dateFrom);
    if (dateTo) params.append('search_expected_arrival_to', dateTo);
    params.append('page', String(currentPage));
    params.append('search_status', 'receivable'); // 未入庫と、残数量のある一部入庫を対象にする
    const apiUrl = `/api/inventory/purchase-orders/?${params.toString()}`;

    try {
      const response = await authFetch(apiUrl);
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
      const data = await response.json();
      setPurchaseOrders(data.results);
      setTotalPages(data.total_pages || 1);
      setTotalCount(data.count || 0);
    } catch (err) {
      setError('入庫予定データの取得中にエラーが発生しました。');
      console.error('Error fetching purchase order data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, dateFrom, dateTo, currentPage]);

  // Initial data fetch and on search term change (debounced)
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchPurchaseOrders();
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm, fetchPurchaseOrders]);

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
        .catch(err => { console.error(err); setError('カメラの起動に失敗しました。'); setCameraState({ isOpen: false, targetSetter: null }); });
    }
    codeReader.current.reset();
  // handleQrCodeResult はこの後で定義されるため依存配列に含められない
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraState.isOpen, cameraState.targetSetter, setError]);

  const openReceiptForm = useCallback((order: PurchaseOrderRow) => {
    const remainingQuantity = remainingOf(order);
    setSelectedOrder(order);
    setReceiptFormData({
      received_quantity: remainingQuantity > 0 ? String(remainingQuantity) : '',
      location: order.location || '',
      warehouse: order.warehouse || '',
      purpose: order.purpose || '',
    });
    setFormError('');
    setFormSuccess('');
  }, []);

  const handleQrCodeResult = useCallback(async (decodedText: string, defaultSetter: ScanTargetSetter | null) => {
    setIsLoading(true);
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

      const data: QrActionResponse = await response.json();
      const { updateSearch } = data.result || {};

      if (updateSearch) {
        setSearchTerm(updateSearch);
      } else if (defaultSetter) {
        defaultSetter(decodedText);
      }
    } catch (err) {
      setError(`QRコード処理エラー: ${errorMessage(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const closeReceiptForm = () => {
    setSelectedOrder(null);
  };

  const handleReceiptFormChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setReceiptFormData(prev => applyShelfInput(prev, name, value, 'location', 'warehouse'));
  };

  const handleReceiptSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const receivedQuantity = parseInt(receiptFormData.received_quantity, 10);
    if (isNaN(receivedQuantity) || receivedQuantity <= 0) {
      setFormError('入庫数量は正の整数である必要があります。');
      return;
    }
    if (selectedOrder && receivedQuantity > remainingOf(selectedOrder)) {
      setFormError('入庫数量が残数量を超えています。');
      return;
    }

    if (!selectedOrder) return;
    const location = receiptFormData.location.trim();
    const registerDefaultLocation = await inventoryService.confirmRegisterDefaultLocation(selectedOrder, location);

    try {
      const result = await inventoryService.receivePurchaseOrder({
        purchase_order_id: selectedOrder.id,
        received_quantity: receivedQuantity,
        register_default_location: registerDefaultLocation,
        location,
        warehouse: receiptFormData.warehouse.trim(),
        purpose: receiptFormData.purpose,
      });
      setFormSuccess(`発注 ${result.order_number} の入庫処理が正常に完了しました。${result.default_location_registered ? `デフォルト入庫棚番に「${location}」を登録しました。` : ''}`);
      setTimeout(() => {
        closeReceiptForm();
        fetchPurchaseOrders(); // Refresh data
      }, 1500);
    } catch (err) {
      console.error('Error submitting purchase receipt:', err);
      setFormError(err instanceof ApiError ? err.message : '入庫処理中に通信エラーが発生しました。');
    }
  };

  const formatDate = (dateString: CellValue) => {
    if (!dateString) return 'N/A';
    return new Date(String(dateString)).toLocaleDateString('ja-JP');
  };

  const renderOrderList = () => {
    if (isLoading) return <div className="text-center p-3">検索中...</div>;
    if (error) return <div className="alert alert-danger">{error}</div>;
    if (purchaseOrders.length === 0) return <div className="text-center p-3">該当する未入庫の予定がありません。</div>;

    return (
      <div className="list-group">
        {purchaseOrders.map(order => (
          <div key={order.id} className="list-group-item list-group-item-action">
            <div className="d-flex w-100 justify-content-between">
              <h5 className="mb-1">{order.product_name || order.item}</h5>
              <small>予定日: {formatDate(order.expected_arrival)}</small>
            </div>
            <p className="mb-1">発注番号: {order.order_number}</p>
            <p className="mb-1">残数量: {remainingOf(order)} / {order.quantity}</p>
            <button
              className="btn btn-primary btn-sm mt-2"
              onClick={() => openReceiptForm(order)}
              disabled={remainingOf(order) <= 0}
            >
              入庫処理
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderReceiptForm = () => {
    if (!selectedOrder) return null;

    return (
      <div className="mobile-receipt-modal-overlay">
        <div className="mobile-receipt-modal-content">
          <div className="d-flex justify-content-between align-items-center">
            <h4>入庫処理</h4>
            <button onClick={closeReceiptForm} className="btn-close"></button>
          </div>
          <hr />
          <form onSubmit={handleReceiptSubmit}>
            <p><strong>発注番号:</strong> {selectedOrder.order_number}</p>
            <p><strong>品名:</strong> {selectedOrder.product_name || selectedOrder.item}</p>
            <p><strong>残数量:</strong> {remainingOf(selectedOrder)}</p>
            <div className="mb-3"><label htmlFor="received_quantity" className="form-label">入庫数量</label><input type="number" id="received_quantity" name="received_quantity" value={receiptFormData.received_quantity} onChange={handleReceiptFormChange} className="form-control text-end" required min="1" max={remainingOf(selectedOrder)} /></div>
            <div className="mb-3">
              <label htmlFor="warehouse" className="form-label">入庫倉庫</label>
              <div className="input-group">
                <input type="text" id="warehouse" name="warehouse" value={receiptFormData.warehouse} onChange={handleReceiptFormChange} className="form-control" placeholder="倉庫" />
                <button className="btn btn-outline-secondary" type="button" onClick={() => startCameraScan((value: string) => setReceiptFormData(prev => applyShelfInput(prev, 'warehouse', value, 'location', 'warehouse')))} title="カメラでスキャン" aria-label="カメラでスキャン"><CameraIcon /></button>
              </div>
            </div>
            <div className="mb-3">
              <label htmlFor="location" className="form-label">入庫棚番</label>
              <div className="input-group">
                <input type="text" id="location" name="location" value={receiptFormData.location} onChange={handleReceiptFormChange} className="form-control" placeholder="棚番" />
                <button className="btn btn-outline-secondary" type="button" onClick={() => startCameraScan((value: string) => setReceiptFormData(prev => applyShelfInput(prev, 'location', value, 'location', 'warehouse')))} title="カメラでスキャン" aria-label="カメラでスキャン"><CameraIcon /></button>
              </div>
            </div>
            <div className="mb-3">
              <label htmlFor="purpose" className="form-label">用途</label>
              <select id="purpose" className="form-select" value={receiptFormData.purpose} onChange={(e) => setReceiptFormData(prev => ({ ...prev, purpose: e.target.value }))}>
                <option value="">汎用（用途の指定なし）</option>
                {stockPurposes.map(p => (<option key={p.code} value={p.code}>{p.code} - {p.name}</option>))}
              </select>
            </div>
            <div className="mb-3"><ReceiptLocationMap warehouse={receiptFormData.warehouse} location={receiptFormData.location} cellSize={24} /></div>
            {formError && <div className="alert alert-danger">{formError}</div>}
            {formSuccess && <div className="alert alert-success">{formSuccess}</div>}
            <div className="d-grid gap-2 mt-4"><button type="submit" className="btn btn-primary">入庫実行</button><button type="button" className="btn btn-secondary" onClick={closeReceiptForm}>キャンセル</button></div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="mobile-goods-receipt-page">
      <h2 className="page-title">入庫処理</h2>
      <div className="mb-3">
        <div className="input-group">
          <input type="search" className="form-control" placeholder="発注番号などで検索..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
          <button className="btn btn-outline-secondary" type="button" onClick={() => startCameraScan(setSearchTerm)} title="カメラでスキャン" aria-label="カメラでスキャン"><CameraIcon /></button>
        </div>
        <div className="row g-2 mt-1">
          <div className="col-6">
            <label htmlFor="receipt-date-from" className="form-label small mb-0">入荷予定日(開始)</label>
            <input type="date" id="receipt-date-from" className="form-control form-control-sm" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} />
          </div>
          <div className="col-6">
            <label htmlFor="receipt-date-to" className="form-label small mb-0">入荷予定日(終了)</label>
            <input type="date" id="receipt-date-to" className="form-control form-control-sm" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} />
          </div>
        </div>
      </div>
      {renderOrderList()}
      {totalPages > 1 && (
        <div className="d-flex justify-content-center align-items-center my-3">
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1 || isLoading}>← 前へ</button>
          <span className="mx-3 small text-secondary">{currentPage} / {totalPages} （全 {totalCount} 件）</span>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages || isLoading}>次へ →</button>
        </div>
      )}
      {renderReceiptForm()}

      {/* Camera View */}
      {cameraState.isOpen && (
          <div className="camera-view-container">
              <video ref={videoRef} className="camera-video-element"></video>
              <div className="camera-targeting-guide"></div>
              <button onClick={stopCameraScan} className="btn btn-danger close-camera-button">&times; 閉じる</button>
          </div>
      )}
    </div>
  );
};

// 予定日フィルタの初期値(管理者設定。入庫・出庫共通)の取得を待ってから画面を描画する
const MobileGoodsReceiptPage = () => {
  const dateDefaults = useScheduleDateDefaults();
  if (!dateDefaults) return <div className="p-4 text-center text-muted">読み込み中...</div>;
  return <MobileGoodsReceiptPageContent dateDefaults={dateDefaults} />;
};

export default MobileGoodsReceiptPage;