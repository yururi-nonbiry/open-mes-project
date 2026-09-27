import React, { useState, useEffect, useCallback } from 'react';
import inventoryService, { SalesOrder, validateIssueQuantity } from '../services/inventoryService';
import Modal from '../components/Modal';
import WarehouseLocationMapModal from './inventory/WarehouseLocationMapModal';

const GoodsIssue = () => {
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [issueQuantity, setIssueQuantity] = useState('');
  const [modalMessage, setModalMessage] = useState({ text: '', type: '' }); // type: 'success' or 'danger'

  // Location map modal state
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [mapOrderId, setMapOrderId] = useState(null);

  const fetchSalesOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await inventoryService.getIssuableSalesOrders({ status: 'pending' });
      setSalesOrders(data.results || []);
    } catch (e) {
      setError('出庫待ち受注の読み込みに失敗しました。');
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSalesOrders();
  }, [fetchSalesOrders]);

  const openModal = (order) => {
    setSelectedOrder(order);
    setIssueQuantity(order.remaining_quantity > 0 ? order.remaining_quantity.toString() : '');
    setModalMessage({ text: '', type: '' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedOrder(null);
    setIssueQuantity('');
    setModalMessage({ text: '', type: '' });
  };

  const openMapModal = (order) => {
    setMapOrderId(order.id);
    setIsMapModalOpen(true);
  };

  const closeMapModal = () => {
    setIsMapModalOpen(false);
    setMapOrderId(null);
  };

  const handleIssueSubmit = async (e) => {
    e.preventDefault();
    setModalMessage({ text: '', type: '' });

    const validationError = validateIssueQuantity(issueQuantity, selectedOrder.remaining_quantity);
    if (validationError) {
      setModalMessage({ text: validationError, type: 'danger' });
      return;
    }

    try {
      const result = await inventoryService.issueSalesOrder(selectedOrder.id, parseInt(issueQuantity, 10));
      if (result.ok) {
        setModalMessage({ text: result.message, type: 'success' });
        setTimeout(() => {
          closeModal();
          fetchSalesOrders(); // Refresh the list
        }, 1500);
      } else {
        setModalMessage({ text: result.message, type: 'danger' });
      }
    } catch (err) {
      console.error('Error:', err);
      setModalMessage({ text: '通信エラーが発生しました。', type: 'danger' });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return dateString.split('T')[0];
  };

  const renderTableBody = () => {
    if (loading) {
      return <tr><td colSpan="8" className="text-center">読み込み中...</td></tr>;
    }
    if (error) {
      return <tr><td colSpan="8" className="text-center text-danger">{error}</td></tr>;
    }
    if (salesOrders.length === 0) {
      return <tr><td colSpan="8" className="text-center">出庫待ちの受注はありません。</td></tr>;
    }
    return salesOrders.map(order => (
      <tr key={order.id}>
        <td>{order.order_number || '-'}</td>
        <td>{order.item || '-'}</td>
        <td>{order.warehouse || '-'}</td>
        <td className="text-end">{order.quantity}</td>
        <td className="text-end">{order.shipped_quantity}</td>
        <td className="text-end">{order.remaining_quantity}</td>
        <td>{formatDate(order.expected_shipment)}</td>
        <td className="text-center">
          <button
            className="btn btn-sm btn-primary me-1"
            onClick={() => openModal(order)}
            disabled={order.remaining_quantity <= 0}
          >
            出庫
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => openMapModal(order)}
          >
            地図で確認
          </button>
        </td>
      </tr>
    ));
  };

  return (
    <div>
      <h2>出庫処理</h2>
      <div className="table-responsive">
        <table className="table table-striped table-bordered table-hover table-sm">
          <thead className="table-light">
            <tr>
              <th>受注番号</th>
              <th>品目</th>
              <th>倉庫</th>
              <th className="text-end">予定数量</th>
              <th className="text-end">済数量</th>
              <th className="text-end">残数量</th>
              <th>出庫予定日</th>
              <th className="text-center">アクション</th>
            </tr>
          </thead>
          <tbody>
            {renderTableBody()}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <Modal isOpen={isModalOpen} onClose={closeModal}>
          <div className="inventory-modal-content">
            <h2>出庫処理</h2>
            <form onSubmit={handleIssueSubmit}>
              <div className="mb-2"><strong>受注番号:</strong> {selectedOrder.order_number}</div>
              <div className="mb-2"><strong>品目:</strong> {selectedOrder.item}</div>
              <div className="mb-2"><strong>倉庫:</strong> {selectedOrder.warehouse}</div>
              <div className="mb-3"><strong>残数量:</strong> {selectedOrder.remaining_quantity}</div>
              
              <div className="mb-3">
                <label htmlFor="quantity_to_ship" className="form-label">出庫数量:</label>
                <input
                  type="number"
                  id="quantity_to_ship"
                  name="quantity_to_ship"
                  className="form-control"
                  value={issueQuantity}
                  onChange={(e) => setIssueQuantity(e.target.value)}
                  min="1"
                  max={selectedOrder.remaining_quantity}
                  required
                  placeholder={`最大 ${selectedOrder.remaining_quantity}`}
                />
              </div>

              {modalMessage.text && (
                <div className={`alert alert-${modalMessage.type}`}>
                  {modalMessage.text}
                </div>
              )}

              <div className="mt-3 text-end">
                <button type="submit" className="btn btn-primary">確認</button>
                <button type="button" className="btn btn-secondary ms-2" onClick={closeModal}>キャンセル</button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      <WarehouseLocationMapModal isOpen={isMapModalOpen} onClose={closeMapModal} orderId={mapOrderId} />
    </div>
  );
};

export default GoodsIssue;