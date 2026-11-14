import { useState, useRef, useCallback } from 'react';
import authFetch, { describeError, handleError } from '../../utils/api';
import inventoryService from '../../services/inventoryService';
import { useQrScanner } from '../../hooks/useQrScanner';
import QrScannerOverlay from '../../components/common/QrScannerOverlay';
import CameraIcon from '../../components/common/CameraIcon';
import { useStockPurposes } from '../../hooks/useStockPurposes';
import './MobileLocationTransferPage.css'; // 新しいCSSファイルをインポート
import type { ChangeEvent, FormEvent } from 'react';
import { errorMessage } from './mobileTypes';
import { parseShelfQr } from '../../utils/shelfQr';
import type { CameraState, LocationInventoryItem, MobileMessage, ScanTargetSetter, TransferModalState } from './mobileTypes';

const MobileLocationTransferPage = () => {
  // フォーム入力
  const [warehouse, setWarehouse] = useState('MAIN-WH');
  const [sourceLocation, setSourceLocation] = useState('');

  // UI状態
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<MobileMessage>({ text: '', type: '' }); // type: 'success' or 'error'

  // モーダルの状態
  const [modalState, setModalState] = useState<TransferModalState>({
    isOpen: false,
    step: 'selection', // 'selection' or 'transfer'
    items: [],
    selectedItem: null,
    transferQuantity: '',
    targetLocation: '',
    // 用途変更(step === 'purpose')用
    purposeQuantity: '',
    purposeTo: '',
    purposeReason: '',
    message: { text: '', type: '' },
  });
  const stockPurposes = useStockPurposes();

  // カメラの状態
  const [cameraState, setCameraState] = useState<CameraState>({
    isOpen: false,
    targetSetter: null,
  });
  const videoRef = useRef<HTMLVideoElement>(null);


  // メッセージ表示関数
  const showMessage = useCallback((msg: string, type: string, isModal = false) => {
    const messageObj = { text: msg, type: type };
    if (isModal) {
      setModalState(prev => ({ ...prev, message: messageObj }));
    } else {
      setMessage(messageObj);
    }
  }, []);

  // 次へボタンの処理
  const handleFindItems = async () => {
    if (!warehouse || !sourceLocation) {
      showMessage('倉庫と移動元棚番を入力してください。', 'error');
      return;
    }

    setIsLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const params = new URLSearchParams({ warehouse: warehouse, location: sourceLocation });
      const response = await authFetch(`/api/inventory/inventories/by-location/?${params.toString()}`);

      await handleError(response, `サーバーエラー: ${response.status}`);

      const inventoryItems: LocationInventoryItem[] = await response.json();

      if (inventoryItems.length === 0) {
        showMessage('その棚番に移動可能な在庫が見つかりません。', 'error');
      } else if (inventoryItems.length === 1) {
        setModalState(prev => ({ ...prev, isOpen: true, step: 'transfer', items: inventoryItems, selectedItem: inventoryItems[0] }));
      } else {
        setModalState(prev => ({ ...prev, isOpen: true, step: 'selection', items: inventoryItems, selectedItem: null }));
      }
    } catch (error) {
      showMessage(`エラー: ${errorMessage(error)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // モーダルでの品番選択
  const handlePartSelect = (item: LocationInventoryItem) => {
    setModalState(prev => ({ ...prev, step: 'transfer', selectedItem: item, message: { text: '', type: '' } }));
  };

  // モーダルフォームの入力ハンドラ
  const handleModalFormChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setModalState(prev => ({ ...prev, [name]: value }));
  };

  // 棚番QR({"warehouse","shelf"})の読取・入力なら倉庫と棚番に振り分け、それ以外は入力値をそのまま設定する
  const applySourceInput = (value: string) => {
    const shelf = parseShelfQr(value);
    if (!shelf) {
      setSourceLocation(value);
      return;
    }
    setSourceLocation(shelf.shelf);
    if (shelf.warehouse) setWarehouse(shelf.warehouse);
  };
  // 倉庫欄に棚番QRが入力された場合も、倉庫と棚番に振り分ける
  const applyWarehouseInput = (value: string) => {
    const shelf = parseShelfQr(value);
    if (!shelf) {
      setWarehouse(value);
      return;
    }
    if (shelf.warehouse) setWarehouse(shelf.warehouse);
    setSourceLocation(shelf.shelf);
  };
  const applyTargetInput = (value: string) => {
    const shelf = parseShelfQr(value);
    setModalState(prev => ({ ...prev, targetLocation: shelf ? shelf.shelf : value }));
  };

  // 移動実行処理
  const handleExecuteTransfer = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { selectedItem, transferQuantity, targetLocation } = modalState;
    if (!selectedItem) return;

    if (!transferQuantity || !targetLocation) {
      showMessage('移動数量と移動先棚番を入力してください。', 'error', true);
      return;
    }
    if (parseInt(transferQuantity, 10) > selectedItem.quantity) {
      showMessage('移動数量が現在数量を超えています。', 'error', true);
      return;
    }

    setIsLoading(true);
    showMessage('', '', true);

    const payload = {
      quantity_to_move: parseInt(transferQuantity, 10),
      target_warehouse: warehouse, // 移動は同一倉庫内を想定
      target_location: targetLocation,
    };

    try {
      const result = await inventoryService.moveInventory(selectedItem.id, payload);
      showMessage(result.message, 'success', true);
      setTimeout(() => {
        closeModal();
        setSourceLocation('');
      }, 1500);
    } catch (error) {
      showMessage(describeError(error) || 'サーバーとの通信に失敗しました。', 'error', true);
    } finally {
      setIsLoading(false);
    }
  };

  // 用途変更の実行処理(例: 緊急時にA製品用の在庫を汎用へ切り替える)
  const handleExecutePurposeChange = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { selectedItem, purposeQuantity, purposeTo, purposeReason } = modalState;
    if (!selectedItem) return;
    const movable = selectedItem.quantity - selectedItem.reserved;
    const quantity = parseInt(purposeQuantity, 10);
    if (!quantity || quantity <= 0 || quantity > movable) {
      showMessage(`変更数量は1〜${movable}（引当済みを除く）の範囲で入力してください。`, 'error', true);
      return;
    }
    if (purposeTo === (selectedItem.purpose || '')) {
      showMessage('変更前と同じ用途です。変更先の用途を選んでください。', 'error', true);
      return;
    }

    setIsLoading(true);
    showMessage('', '', true);
    try {
      const result = await inventoryService.changeInventoryPurpose(selectedItem.id, {
        quantity,
        purpose: purposeTo,
        reason: purposeReason.trim(),
      });
      showMessage(result.message, 'success', true);
      setTimeout(() => {
        closeModal();
        setSourceLocation('');
      }, 1500);
    } catch (error) {
      showMessage(describeError(error) || 'サーバーとの通信に失敗しました。', 'error', true);
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setModalState({ isOpen: false, step: 'selection', items: [], selectedItem: null, transferQuantity: '', targetLocation: '', purposeQuantity: '', purposeTo: '', purposeReason: '', message: { text: '', type: '' } });
  };

  // --- Camera Scan Logic ---
  const startCameraScan = (targetSetter: ScanTargetSetter) => {
    setCameraState({ isOpen: true, targetSetter: targetSetter });
  };

  const stopCameraScan = useCallback(() => {
    // The reset logic is handled by the useEffect cleanup function below.
    // This avoids race conditions and multiple reset calls.
    setCameraState({ isOpen: false, targetSetter: null });
  }, []);

  useQrScanner({
    isOpen: cameraState.isOpen,
    videoRef,
    onResult: (text) => {
      setCameraState({ isOpen: false, targetSetter: null });
      handleQrCodeResult(text, cameraState.targetSetter);
    },
    onError: (err) => {
      console.error(err);
      showMessage('カメラの起動に失敗しました。', 'error');
      setCameraState({ isOpen: false, targetSetter: null });
    },
  });

  // 棚番移動画面の入力欄には、QRコードアクション(検索欄への入力)の対象がないため、読み取った文字列をそのまま入力欄に設定する
  const handleQrCodeResult = useCallback((decodedText: string, defaultSetter: ScanTargetSetter | null) => {
    if (defaultSetter) defaultSetter(decodedText);
  }, []);

  const renderMessage = (msg: MobileMessage) => {
    if (!msg.text) return null;
    return <div className={`alert mt-3 ${msg.type === 'error' ? 'alert-danger' : 'alert-success'}`}>{msg.text}</div>;
  };

  const { isOpen: isModalOpen, step: modalStep, items, selectedItem, transferQuantity, targetLocation, purposeQuantity, purposeTo, purposeReason, message: modalMessage } = modalState;

  return (
    <div className="mobile-page-container">
      <h2 className="page-title">棚番移動</h2>

      <div className="card p-3 shadow-sm">
        <div className="mb-3">
          <label htmlFor="warehouse_input" className="form-label fw-bold">倉庫</label>
          <input type="text" className="form-control form-control-lg" id="warehouse_input" value={warehouse} onChange={e => applyWarehouseInput(e.target.value)} required />
        </div>
        <div className="mb-3">
          <label htmlFor="source_location_input" className="form-label fw-bold">移動元棚番</label>
          <div className="input-group">
            <input type="text" className="form-control form-control-lg" id="source_location_input" placeholder="移動元をスキャン" value={sourceLocation} onChange={e => applySourceInput(e.target.value)} required />
            <button className="btn btn-outline-secondary" type="button" onClick={() => startCameraScan(applySourceInput)} title="カメラでスキャン" aria-label="カメラでスキャン"><CameraIcon /></button>
          </div>
        </div>
        {renderMessage(message)}
        <div className="d-grid mt-4">
          <button onClick={handleFindItems} className="btn btn-primary btn-lg" disabled={isLoading}>{isLoading ? '検索中...' : '次へ'}</button>
        </div>
      </div>

      {isModalOpen && (
        <div className="mobile-modal-overlay">
          <div className="mobile-modal-content">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4 className="modal-title">在庫移動</h4>
              <button onClick={closeModal} className="btn-close"></button>
            </div>
            {modalStep === 'selection' && (
              <div>
                <p className="fw-bold">移動する品番を選択してください:</p>
                <div className="list-group">
                  {items.map((item, index) => (
                    <button key={index} type="button" className="list-group-item list-group-item-action" onClick={() => handlePartSelect(item)}>
                      <div className="fw-bold">{item.part_number}</div>
                      <div>用途: {item.purpose || '汎用'}</div>
                      <div>数量: {item.quantity}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {modalStep === 'transfer' && selectedItem && (
              <form onSubmit={handleExecuteTransfer}>
                <div className="mb-3"><label className="form-label fw-bold">品番</label><p className="form-control-plaintext form-control-lg ps-2">{selectedItem.part_number}</p></div>
                <div className="mb-3"><label className="form-label fw-bold">用途</label><p className="form-control-plaintext form-control-lg ps-2">{selectedItem.purpose || '汎用'}</p></div>
                <div className="mb-3"><label className="form-label fw-bold">現在数量</label><p className="form-control-plaintext form-control-lg ps-2">{selectedItem.quantity} (有効: {selectedItem.available_quantity})</p></div>
                <div className="mb-3">
                  <label htmlFor="transferQuantity" className="form-label fw-bold">移動数量</label>
                  <input type="number" id="transferQuantity" name="transferQuantity" className="form-control form-control-lg text-end" value={transferQuantity} onChange={handleModalFormChange} min="1" max={selectedItem.quantity} required />
                </div>
                <div className="mb-3">
                  <label htmlFor="targetLocation" className="form-label fw-bold">移動先棚番</label>
                  <div className="input-group">
                    <input type="text" id="targetLocation" name="targetLocation" className="form-control form-control-lg" placeholder="移動先をスキャン" value={targetLocation} onChange={e => applyTargetInput(e.target.value)} required />
                    <button className="btn btn-outline-secondary" type="button" onClick={() => startCameraScan(applyTargetInput)} title="カメラでスキャン" aria-label="カメラでスキャン"><CameraIcon /></button>
                  </div>
                </div>
                {renderMessage(modalMessage)}
                <div className="d-grid gap-2 mt-4">
                  <button type="submit" className="btn btn-primary btn-lg" disabled={isLoading}>{isLoading ? '処理中...' : '移動実行'}</button>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setModalState(p => ({ ...p, step: 'purpose', purposeQuantity: String(Math.max(0, selectedItem.quantity - selectedItem.reserved)), purposeTo: '', purposeReason: '', message: { text: '', type: '' } }))}>用途を変更する</button>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>キャンセル</button>
                </div>
              </form>
            )}
            {modalStep === 'purpose' && selectedItem && (
              <form onSubmit={handleExecutePurposeChange}>
                <div className="mb-3"><label className="form-label fw-bold">品番</label><p className="form-control-plaintext form-control-lg ps-2">{selectedItem.part_number}</p></div>
                <div className="mb-3"><label className="form-label fw-bold">現在の用途</label><p className="form-control-plaintext form-control-lg ps-2">{selectedItem.purpose || '汎用'}</p></div>
                <div className="mb-3">
                  <label htmlFor="purposeQuantity" className="form-label fw-bold">変更数量（引当済みを除く最大 {selectedItem.quantity - selectedItem.reserved}）</label>
                  <input type="number" id="purposeQuantity" name="purposeQuantity" className="form-control form-control-lg text-end" value={purposeQuantity} onChange={handleModalFormChange} min="1" max={selectedItem.quantity - selectedItem.reserved} required />
                </div>
                <div className="mb-3">
                  <label htmlFor="purposeTo" className="form-label fw-bold">変更先の用途</label>
                  <select id="purposeTo" name="purposeTo" className="form-select form-select-lg" value={purposeTo} onChange={handleModalFormChange}>
                    <option value="">汎用（どの用途にも使える）</option>
                    {stockPurposes.map(p => (<option key={p.code} value={p.code}>{p.code} - {p.name}</option>))}
                  </select>
                </div>
                <div className="mb-3">
                  <label htmlFor="purposeReason" className="form-label fw-bold">理由（任意）</label>
                  <input type="text" id="purposeReason" name="purposeReason" className="form-control form-control-lg" value={purposeReason} onChange={handleModalFormChange} placeholder="例：緊急対応" />
                </div>
                {renderMessage(modalMessage)}
                <div className="d-grid gap-2 mt-4">
                  <button type="submit" className="btn btn-primary btn-lg" disabled={isLoading}>{isLoading ? '処理中...' : '用途を変更'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setModalState(p => ({ ...p, step: 'transfer', message: { text: '', type: '' } }))}>戻る</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {cameraState.isOpen && (
        <QrScannerOverlay videoRef={videoRef} onClose={stopCameraScan} />
      )}
    </div>
  );
};

export default MobileLocationTransferPage;