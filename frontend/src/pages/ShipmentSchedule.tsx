import React, { useState, useEffect, useCallback } from 'react';
import { Spinner } from 'react-bootstrap';
import authFetch from '../utils/api';

const STATUS_TABS = [
  { value: 'pending', label: '未出庫' },
  { value: 'partially_shipped', label: '一部出庫' },
  { value: 'shipped', label: '出庫済み' },
  { value: '', label: 'すべて表示' },
];

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '未出庫', className: 'receipt-status-badge status-pending' },
  partially_shipped: { label: '一部出庫', className: 'receipt-status-badge status-partial' },
  shipped: { label: '出庫済み', className: 'receipt-status-badge status-completed' },
  canceled: { label: 'キャンセル', className: 'receipt-status-badge status-canceled' },
};

const ShipmentSchedule: React.FC = () => {
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [keyword, setKeyword] = useState('');

  const fetchSalesOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('search_status', statusFilter);
      if (keyword.trim()) params.set('search_q', keyword.trim());
      const response = await authFetch(`/api/inventory/sales-orders/?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSalesOrders(data.results || []);
    } catch (e) {
      setError('出庫予定データの読み込みに失敗しました。');
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, keyword]);

  useEffect(() => {
    fetchSalesOrders();
  }, [fetchSalesOrders]);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const renderTableBody = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan={9} className="text-center py-5">
            <Spinner animation="border" variant="primary" size="sm" className="me-2" />
            <span className="text-muted">出庫予定データを読み込んでいます...</span>
          </td>
        </tr>
      );
    }
    if (error) {
      return (
        <tr>
          <td colSpan={9} className="text-center text-danger py-4 fw-bold">
            {error}
          </td>
        </tr>
      );
    }
    if (salesOrders.length === 0) {
      return (
        <tr>
          <td colSpan={9} className="text-center py-5 text-muted">
            <div className="fw-bold mb-1">該当する出庫予定はありません</div>
            <div className="small">上の状態タブや検索条件を切り替えてご確認ください。</div>
          </td>
        </tr>
      );
    }
    return salesOrders.map(order => {
      const remaining = (order.quantity ?? 0) - (order.shipped_quantity ?? 0);
      const meta = STATUS_META[order.status] || {
        label: order.status_display || order.status || '—',
        className: 'receipt-status-badge',
      };
      return (
        <tr key={order.id}>
          <td className="fw-bold text-dark">{order.order_number || '—'}</td>
          <td className="fw-semibold">{order.item || '—'}</td>
          <td className="text-end fw-semibold">{order.quantity ?? 0}</td>
          <td className="text-end">{order.shipped_quantity ?? 0}</td>
          <td className="text-end">
            <span className={remaining > 0 ? 'receipt-remaining-qty has-remaining' : 'receipt-remaining-qty zero'}>
              {remaining}
            </span>
          </td>
          <td>{formatDate(order.order_date)}</td>
          <td>{formatDate(order.expected_shipment)}</td>
          <td>{order.warehouse || '—'}</td>
          <td>
            <span className={meta.className}>{meta.label}</span>
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="goods-receipt-page">
      <div className="goods-receipt-filter-panel">
        <div className="receipt-status-tabs-row">
          <span className="filter-section-label">状態フィルタ：</span>
          <div className="receipt-status-tabs" role="tablist">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value || 'all'}
                type="button"
                className={`receipt-status-tab ${statusFilter === tab.value ? 'active' : ''}`}
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="receipt-result-count ms-auto">
            対象件数：<strong>{salesOrders.length}</strong> 件
          </span>
        </div>

        <div className="receipt-search-inputs-row">
          <div className="receipt-search-field">
            <label className="receipt-search-label" htmlFor="shipment-keyword">
              受注番号・品番検索
            </label>
            <input
              id="shipment-keyword"
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              className="form-control form-control-sm"
              placeholder="受注番号・品番を入力..."
            />
          </div>
          <div className="receipt-search-actions">
            <button type="button" onClick={fetchSalesOrders} className="btn btn-primary btn-sm fw-bold px-3">
              検索
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('pending');
                setKeyword('');
              }}
              className="btn btn-outline-secondary btn-sm"
            >
              条件リセット
            </button>
          </div>
        </div>
      </div>

      <div className="goods-receipt-table-card">
        <div className="table-responsive mb-0">
          <table className="table table-hover align-middle goods-receipt-table mb-0">
            <thead>
              <tr>
                <th>受注番号</th>
                <th>製品（品番）</th>
                <th className="text-end">出庫予定数</th>
                <th className="text-end">出庫済</th>
                <th className="text-end">未出庫残</th>
                <th>受注日</th>
                <th>出庫予定日</th>
                <th>出庫倉庫</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>{renderTableBody()}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ShipmentSchedule;
