import React, { useState, useEffect, useCallback } from 'react';
import { Spinner } from 'react-bootstrap';
import authFetch from '../utils/api';
import type { SalesOrder } from '../services/inventoryService';
import { t, registerTermTarget } from '../utils/terms';
import { useScheduleDateDefaults } from '../hooks/useScheduleDateDefaults';
import type { ScheduleDateDefaults } from '../services/scheduleDateDefaultsService';
import Pagination from '../components/common/Pagination';

const PAGE_SIZE = 25;

const STATUS_TABS = [
  { value: 'pending', label: '未出庫' },
  { value: 'shipped', label: '出庫済み' },
  { value: '', label: 'すべて表示' },
];
registerTermTarget(STATUS_TABS);

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '未出庫', className: 'receipt-status-badge status-pending' },
  partially_shipped: { label: '一部出庫', className: 'receipt-status-badge status-partial' },
  shipped: { label: '出庫済み', className: 'receipt-status-badge status-completed' },
  canceled: { label: 'キャンセル', className: 'receipt-status-badge status-canceled' },
};
registerTermTarget(STATUS_META);

const ShipmentScheduleContent = ({ dateDefaults }: { dateDefaults: ScheduleDateDefaults }) => {
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [keyword, setKeyword] = useState('');
  // 予定日の範囲(初期値は管理者設定の出庫予定日フィルタ)
  const [dateFrom, setDateFrom] = useState(dateDefaults.from);
  const [dateTo, setDateTo] = useState(dateDefaults.to);
  // 生産計画の部品引当で作られる内部の出庫予定(INT-)も表示するか
  const [includeInternal, setIncludeInternal] = useState(false);
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState({ count: 0, totalPages: 1, next: null as string | null, previous: null as string | null });

  const fetchSalesOrders = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(targetPage), page_size: String(PAGE_SIZE) });
      if (statusFilter) params.set('search_status', statusFilter);
      if (keyword.trim()) params.set('search_q', keyword.trim());
      if (dateFrom) params.set('search_expected_shipment_from', dateFrom);
      if (dateTo) params.set('search_expected_shipment_to', dateTo);
      if (!includeInternal) params.set('exclude_internal', 'true');
      const response = await authFetch(`/api/inventory/sales-orders/?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSalesOrders(data.results || []);
      setPageData({
        count: data.count ?? 0,
        totalPages: data.total_pages ?? 1,
        next: data.next ?? null,
        previous: data.previous ?? null,
      });
    } catch (e) {
      setError(t('出庫予定データの読み込みに失敗しました。'));
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  // 検索語は「検索」ボタン・Enterで確定する(入力のたびに検索しない)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFrom, dateTo, includeInternal]);

  // 条件を変えたら1ページ目から表示する
  useEffect(() => {
    setPage(1);
    fetchSalesOrders(1);
  }, [fetchSalesOrders]);

  const goToPage = (target: number) => {
    setPage(target);
    fetchSalesOrders(target);
  };

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
          <td colSpan={10} className="text-center py-5">
            <Spinner animation="border" variant="primary" size="sm" className="me-2" />
            <span className="text-muted">{t('出庫予定データを読み込んでいます...')}</span>
          </td>
        </tr>
      );
    }
    if (error) {
      return (
        <tr>
          <td colSpan={10} className="text-center text-danger py-4 fw-bold">
            {error}
          </td>
        </tr>
      );
    }
    if (salesOrders.length === 0) {
      return (
        <tr>
          <td colSpan={10} className="text-center py-5 text-muted">
            <div className="fw-bold mb-1">{t('該当する出庫予定はありません')}</div>
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
          <td className="fw-bold text-dark">
            {order.order_number || '—'}
            {order.is_internal && (
              <span className="badge bg-secondary ms-1" title={t('生産計画の部品引当で作られた出庫予定です。ピッキング画面で出庫します。')}>
                {t('部品引当')}
              </span>
            )}
          </td>
          <td className="fw-semibold">{order.item || '—'}</td>
          <td className="text-end fw-semibold">{order.quantity ?? 0}</td>
          <td className="text-end">{order.shipped_quantity ?? 0}</td>
          <td className="text-end">
            <span className={remaining > 0 ? 'receipt-remaining-qty has-remaining' : 'receipt-remaining-qty zero'}>
              {remaining}
            </span>
          </td>
          <td>{formatDate(order.order_date)}</td>
          <td>{formatDate(order.created_at)}</td>
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
            対象件数：<strong>{pageData.count}</strong> 件
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
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) goToPage(1); }}
              className="form-control form-control-sm"
              placeholder="受注番号・品番を入力..."
            />
          </div>
          <div className="receipt-search-field">
            <label className="receipt-search-label" htmlFor="shipment-date-from">{t('出庫予定日')}（から）</label>
            <input id="shipment-date-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="form-control form-control-sm" />
          </div>
          <div className="receipt-search-field">
            <label className="receipt-search-label" htmlFor="shipment-date-to">{t('出庫予定日')}（まで）</label>
            <input id="shipment-date-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="form-control form-control-sm" />
          </div>
          <div className="receipt-search-field d-flex align-items-end">
            <div className="form-check mb-1">
              <input id="shipment-include-internal" type="checkbox" className="form-check-input" checked={includeInternal} onChange={e => setIncludeInternal(e.target.checked)} />
              <label className="form-check-label small" htmlFor="shipment-include-internal">{t('部品引当の出庫予定も表示')}</label>
            </div>
          </div>
          <div className="receipt-search-actions">
            <button type="button" onClick={() => goToPage(1)} className="btn btn-primary btn-sm fw-bold px-3">
              検索
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('pending');
                setKeyword('');
                setDateFrom(dateDefaults.from);
                setDateTo(dateDefaults.to);
                setIncludeInternal(false);
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
                <th className="text-end">{t('出庫予定数')}</th>
                <th className="text-end">{t('出庫済')}</th>
                <th className="text-end">{t('未出庫残')}</th>
                <th>受注日</th>
                <th>投入日時</th>
                <th>{t('出庫予定日')}</th>
                <th>{t('出庫先')}</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>{renderTableBody()}</tbody>
          </table>
        </div>
      </div>
      {pageData.totalPages > 1 && (
        <Pagination
          next={pageData.next}
          previous={pageData.previous}
          pageInfo={`${page} / ${pageData.totalPages} ページ`}
          onPageChange={(url) => { if (url) goToPage(url === pageData.next ? page + 1 : page - 1); }}
        />
      )}
    </div>
  );
};

const ShipmentSchedule: React.FC = () => {
  const dateDefaults = useScheduleDateDefaults();
  if (!dateDefaults) return <div className="p-4 text-center text-muted">読み込み中...</div>;
  return <ShipmentScheduleContent dateDefaults={dateDefaults} />;
};

export default ShipmentSchedule;
