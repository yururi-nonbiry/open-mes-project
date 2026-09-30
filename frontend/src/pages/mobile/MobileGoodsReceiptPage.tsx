import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import authFetch, { ApiError, handleError } from '../../utils/api';
import inventoryService from '../../services/inventoryService';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import CameraIcon from '../../components/common/CameraIcon';
import './MobileGoodsReceiptPage.css';
import './MobileLocationTransferPage.css'; // スタイルを再利用

const MobileGoodsReceiptPage = () => {
  // State for purchase orders, loading/error status
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for search
  const [searchTerm, setSearchTerm] = useState('');

  // State for the receipt processing form (acting as a modal)
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receiptFormData, setReceiptFormData] = useState({ received_quantity: '', location: '', warehouse: '' });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // カメラの状態
  const [cameraState, setCameraState] = useState({
    isOpen: false,
    targetSetter: null,
  });
  const videoRef = useRef(null);
  const codeReader = useRef(new BrowserMultiFormatReader());

  const navigate = useNavigate();

  // API call to fetch purchase order data
  const fetchPurchaseOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (searchTerm) {
      // General search for mobile view
      params.append('search_q', searchTerm);
    }
    params.append('search_status', 'pending'); // Mobile view is for pending receipts
    const apiUrl = `/api/inventory/purchase-orders/?${params.toString()}`;

    try {
      const response = await authFetch(apiUrl);
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
      const data = await response.json();
      setPurchaseOrders(data.results);
    } catch (err) {
      setError('入庫予定データの取得中にエラーが発生しました。');
      console.error('Error fetching purchase order data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm]);

  // Initial data fetch and on search term change (debounced)
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchPurchaseOrders();
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm, fetchPurchaseOrders]);

  // --- Camera Scan Logic ---
  const startCameraScan = (targetSetter) => {
    setCameraState({ isOpen: true, targetSetter: targetSetter });
  };

  const stopCameraScan = useCallback(() => {
    setCameraState({ isOpen: false, targetSetter: null });
  }, []);

  useEffect(() => {
    if (cameraState.isOpen && videoRef.current) {
      let controls = null;
      codeReader.current
        .decodeFromVideoDevice(undefined, videoRef.current,
          (result, error, ctrl) => {
            if (result) {
              ctrl.stop();
              setCameraState({ isOpen: false, targetSetter: null });
              handleQrCodeResult(result.getText(), cameraState.targetSetter);
            }
            if (error && !(error instanceof NotFoundException)) {
              console.error(error);
              ctrl.stop();
              setError('バーコードの読み取りに失敗しました。');
              setCameraState({ isOpen: false, targetSetter: null });
            }
          }
        )
        .then(ctrl => { controls = ctrl; })
        .catch(err => { console.error(err); setError('カメラの起動に失敗しました。'); setCameraState({ isOpen: false, targetSetter: null }); });
      return () => { if (controls) controls.stop(); };
    }
    codeReader.current.reset();
  }, [cameraState.isOpen, cameraState.targetSetter, setError]);

  const openReceiptForm = useCallback((order) => {
    const remainingQuantity = order.quantity - order.received_quantity;
    setSelectedOrder(order);
    setReceiptFormData({
      received_quantity: remainingQuantity > 0 ? String(remainingQuantity) : '',
      location: order.location || '',
      warehouse: order.warehouse || '',
    });
    setFormError('');
    setFormSuccess('');
  }, []);

  const handleQrCodeResult = useCallback(async (decodedText, defaultSetter) => {
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

      const data = await response.json();
      const { action, payload, navigate: navTarget, state, updateSearch, updateFields } = data.result || {};

      let handled = false;
      if (action) {
        switch (action) {
          case 'goods_receipt':
            if (payload) {
              openReceiptForm(payload);
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
              setSearchTerm(updateSearch);
              handled = true;
            }
            break;
          case 'update_fields':
            if (updateFields) {
              setReceiptFormData(prev => ({ ...prev, ...updateFields }));
              handled = true;
            }
            break;
        }
      }

      if (!handled && defaultSetter) defaultSetter(decodedText);
    } catch (err) {
      setError(`QRコード処理エラー: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [navigate, openReceiptForm]);

  const closeReceiptForm = () => {
    setSelectedOrder(null);
  };

  const handleReceiptFormChange = (e) => {
    const { name, value } = e.target;
    setReceiptFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleReceiptSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const receivedQuantity = parseInt(receiptFormData.received_quantity, 10);
    if (isNaN(receivedQuantity) || receivedQuantity <= 0) {
      setFormError('入庫数量は正の整数である必要があります。');
      return;
    }
    if (selectedOrder && receivedQuantity > (selectedOrder.quantity - selectedOrder.received_quantity)) {
      setFormError('入庫数量が残数量を超えています。');
      return;
    }

    try {
      const result = await inventoryService.receivePurchaseOrder({
        purchase_order_id: selectedOrder.id,
        received_quantity: receivedQuantity,
        location: receiptFormData.location.trim(),
        warehouse: receiptFormData.warehouse.trim(),
      });
      setFormSuccess(`発注 ${result.order_number} の入庫処理が正常に完了しました。`);
      setTimeout(() => {
        closeReceiptForm();
        fetchPurchaseOrders(); // Refresh data
      }, 1500);
    } catch (err) {
      console.error('Error submitting purchase receipt:', err);
      setFormError(err instanceof ApiError ? err.message : '入庫処理中に通信エラーが発生しました。');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('ja-JP');
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
            <p className="mb-1">残数量: {order.quantity - order.received_quantity} / {order.quantity}</p>
            <button
              className="btn btn-primary btn-sm mt-2"
              onClick={() => openReceiptForm(order)}
              disabled={order.quantity - order.received_quantity <= 0}
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
            <p><strong>残数量:</strong> {selectedOrder.quantity - selectedOrder.received_quantity}</p>
            <div className="mb-3"><label htmlFor="received_quantity" className="form-label">入庫数量</label><input type="number" id="received_quantity" name="received_quantity" value={receiptFormData.received_quantity} onChange={handleReceiptFormChange} className="form-control text-end" required min="1" max={selectedOrder.quantity - selectedOrder.received_quantity} /></div>
            <div className="mb-3">
              <label htmlFor="warehouse" className="form-label">入庫倉庫</label>
              <div className="input-group">
                <input type="text" id="warehouse" name="warehouse" value={receiptFormData.warehouse} onChange={handleReceiptFormChange} className="form-control" placeholder="倉庫" />
                <button className="btn btn-outline-secondary" type="button" onClick={() => startCameraScan(value => setReceiptFormData(prev => ({ ...prev, warehouse: value })))} title="カメラでスキャン" aria-label="カメラでスキャン"><CameraIcon /></button>
              </div>
            </div>
            <div className="mb-3">
              <label htmlFor="location" className="form-label">入庫棚番</label>
              <div className="input-group">
                <input type="text" id="location" name="location" value={receiptFormData.location} onChange={handleReceiptFormChange} className="form-control" placeholder="棚番" />
                <button className="btn btn-outline-secondary" type="button" onClick={() => startCameraScan(value => setReceiptFormData(prev => ({ ...prev, location: value })))} title="カメラでスキャン" aria-label="カメラでスキャン"><CameraIcon /></button>
              </div>
            </div>
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
          <input type="search" className="form-control" placeholder="発注番号などで検索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          <button className="btn btn-outline-secondary" type="button" onClick={() => startCameraScan(setSearchTerm)} title="カメラでスキャン" aria-label="カメラでスキャン"><CameraIcon /></button>
        </div>
      </div>
      {renderOrderList()}
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

export default MobileGoodsReceiptPage;