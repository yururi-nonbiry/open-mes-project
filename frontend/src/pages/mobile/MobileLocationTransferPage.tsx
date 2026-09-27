import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import authFetch, { describeError, handleError } from '../../utils/api';
import inventoryService from '../../services/inventoryService';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import './MobileLocationTransferPage.css'; // 新しいCSSファイルをインポート

const MobileLocationTransferPage = () => {
  // フォーム入力
  const [warehouse, setWarehouse] = useState('MAIN-WH');
  const [sourceLocation, setSourceLocation] = useState('');

  // UI状態
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' }); // type: 'success' or 'error'

  // モーダルの状態
  const [modalState, setModalState] = useState({
    isOpen: false,
    step: 'selection', // 'selection' or 'transfer'
    items: [],
    selectedItem: null,
    transferQuantity: '',
    targetLocation: '',
    message: { text: '', type: '' },
  });

  // カメラの状態
  const [cameraState, setCameraState] = useState({
    isOpen: false,
    targetSetter: null,
  });
  const videoRef = useRef(null);
  const codeReader = useRef(new BrowserMultiFormatReader());

  const navigate = useNavigate();

  // メッセージ表示関数
  const showMessage = useCallback((msg, type, isModal = false) => {
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

      const inventoryItems = await response.json();

      if (inventoryItems.length === 0) {
        showMessage('その棚番に移動可能な在庫が見つかりません。', 'error');
      } else if (inventoryItems.length === 1) {
        setModalState(prev => ({ ...prev, isOpen: true, step: 'transfer', items: inventoryItems, selectedItem: inventoryItems[0] }));
      } else {
        setModalState(prev => ({ ...prev, isOpen: true, step: 'selection', items: inventoryItems, selectedItem: null }));
      }
    } catch (error) {
      showMessage(`エラー: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // モーダルでの品番選択
  const handlePartSelect = (item) => {
    setModalState(prev => ({ ...prev, step: 'transfer', selectedItem: item, message: { text: '', type: '' } }));
  };

  // モーダルフォームの入力ハンドラ
  const handleModalFormChange = (e) => {
    const { name, value } = e.target;
    setModalState(prev => ({ ...prev, [name]: value }));
  };

  // 移動実行処理
  const handleExecuteTransfer = async (e) => {
    e.preventDefault();
    const { selectedItem, transferQuantity, targetLocation } = modalState;

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

  const closeModal = () => {
    setModalState({ isOpen: false, step: 'selection', items: [], selectedItem: null, transferQuantity: '', targetLocation: '', message: { text: '', type: '' } });
  };

  // --- Camera Scan Logic ---
  const startCameraScan = (targetSetter) => {
    setCameraState({ isOpen: true, targetSetter: targetSetter });
  };

  const stopCameraScan = useCallback(() => {
    // The reset logic is handled by the useEffect cleanup function below.
    // This avoids race conditions and multiple reset calls.
    setCameraState({ isOpen: false, targetSetter: null });
  }, []);

  useEffect(() => {
    if (cameraState.isOpen && videoRef.current) {
      let controls = null;
      codeReader.current
        .decodeFromVideoDevice(undefined, videoRef.current,
          (result, error, ctrl) => {
            if (result) {
              // Successful scan, stop the camera
              ctrl.stop();
              setCameraState({ isOpen: false, targetSetter: null });
              handleQrCodeResult(result.getText(), cameraState.targetSetter);
            }
            if (error && !(error instanceof NotFoundException)) {
              console.error(error);
              ctrl.stop();
              showMessage('バーコードの読み取りに失敗しました。', 'error');
              setCameraState({ isOpen: false, targetSetter: null });
            }
          }
        )
        .then(ctrl => { controls = ctrl; })
        .catch(err => {
            console.error(err);
            showMessage('カメラの起動に失敗しました。', 'error');
            setCameraState({ isOpen: false, targetSetter: null });
        });
      return () => {
        // Cleanup function to stop the camera when the component unmounts or isOpen changes.
        if (controls) {
          controls.stop();
        }
      };
    }
    // If cameraState.isOpen is false, ensure the camera is stopped.
    codeReader.current.reset();
  }, [cameraState.isOpen, cameraState.targetSetter, showMessage]);

  const handleQrCodeResult = useCallback(async (decodedText, defaultSetter) => {
    setIsLoading(true);
    showMessage('', ''); // Clear main message

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
        const { action, payload, navigate: navTarget, state, updateFields } = data.result || {};

        let handled = false;
        if (action) {
            switch (action) {
                case 'location_transfer':
                case 'update_fields': // Treat update_fields as an alias for location_transfer action
                    const fields = payload || updateFields;
                    if (fields) {
                        if (fields.sourceLocation !== undefined) setSourceLocation(fields.sourceLocation);
                        if (fields.warehouse !== undefined) setWarehouse(fields.warehouse);
                        if (fields.targetLocation !== undefined) {
                            setModalState(prev => ({ ...prev, targetLocation: fields.targetLocation }));
                        }
                        handled = true;
                    }
                    break;
                case 'navigate':
                    if (navTarget) {
                        navigate(navTarget, { state });
                        handled = true;
                    }
                    break;
            }
        }

        // Fallback for older action format
        if (!handled && updateFields) {
            let handled = false;
            const fields = updateFields;
            if (fields.sourceLocation !== undefined) setSourceLocation(fields.sourceLocation);
            if (fields.warehouse !== undefined) setWarehouse(fields.warehouse);
            if (fields.targetLocation !== undefined) {
                setModalState(prev => ({ ...prev, targetLocation: fields.targetLocation }));
            }
            handled = true;
        }

        if (!handled && defaultSetter) defaultSetter(decodedText);
    } catch (err) {
        showMessage(`QRコード処理エラー: ${err.message}`, 'error');
    } finally {
        setIsLoading(false);
    }
  }, [navigate, showMessage]);

  const renderMessage = (msg) => {
    if (!msg.text) return null;
    return <div className={`alert mt-3 ${msg.type === 'error' ? 'alert-danger' : 'alert-success'}`}>{msg.text}</div>;
  };

  const { isOpen: isModalOpen, step: modalStep, items, selectedItem, transferQuantity, targetLocation, message: modalMessage } = modalState;

  return (
    <div className="mobile-page-container">
      <h2 className="page-title">棚番移動</h2>

      <div className="card p-3 shadow-sm">
        <div className="mb-3">
          <label htmlFor="warehouse_input" className="form-label fw-bold">倉庫</label>
          <input type="text" className="form-control form-control-lg" id="warehouse_input" value={warehouse} onChange={e => setWarehouse(e.target.value)} required />
        </div>
        <div className="mb-3">
          <label htmlFor="source_location_input" className="form-label fw-bold">移動元棚番</label>
          <div className="input-group">
            <input type="text" className="form-control form-control-lg" id="source_location_input" placeholder="移動元をスキャン" value={sourceLocation} onChange={e => setSourceLocation(e.target.value)} required />
            <button className="btn btn-outline-secondary" type="button" onClick={() => startCameraScan(setSourceLocation)} title="カメラでスキャン">📷</button>
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
                      <div>数量: {item.quantity}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {modalStep === 'transfer' && selectedItem && (
              <form onSubmit={handleExecuteTransfer}>
                <div className="mb-3"><label className="form-label fw-bold">品番</label><p className="form-control-plaintext form-control-lg ps-2">{selectedItem.part_number}</p></div>
                <div className="mb-3"><label className="form-label fw-bold">現在数量</label><p className="form-control-plaintext form-control-lg ps-2">{selectedItem.quantity} (有効: {selectedItem.available_quantity})</p></div>
                <div className="mb-3">
                  <label htmlFor="transferQuantity" className="form-label fw-bold">移動数量</label>
                  <input type="number" id="transferQuantity" name="transferQuantity" className="form-control form-control-lg text-end" value={transferQuantity} onChange={handleModalFormChange} min="1" max={selectedItem.quantity} required />
                </div>
                <div className="mb-3">
                  <label htmlFor="targetLocation" className="form-label fw-bold">移動先棚番</label>
                  <div className="input-group">
                    <input type="text" id="targetLocation" name="targetLocation" className="form-control form-control-lg" placeholder="移動先をスキャン" value={targetLocation} onChange={handleModalFormChange} required />
                    <button className="btn btn-outline-secondary" type="button" onClick={() => startCameraScan(val => setModalState(p => ({ ...p, targetLocation: val })))} title="カメラでスキャン">📷</button>
                  </div>
                </div>
                {renderMessage(modalMessage)}
                <div className="d-grid gap-2 mt-4">
                  <button type="submit" className="btn btn-primary btn-lg" disabled={isLoading}>{isLoading ? '処理中...' : '移動実行'}</button>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>キャンセル</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

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

export default MobileLocationTransferPage;