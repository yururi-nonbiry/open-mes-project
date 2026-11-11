import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Spinner, Alert } from 'react-bootstrap';
import inventoryService, { SalesOrder, validateIssueQuantity } from '../services/inventoryService';
import { NavIcon } from '../config/navigationConfig';
import { useWorkCenters } from '../hooks/useWorkCenters';
import WarehouseLocationMapModal from './inventory/WarehouseLocationMapModal';
import authFetch from '../utils/api';
import type { DisplaySetting, ModelFieldInfo } from './types/listPage';

const NUMERIC_FIELDS = ['quantity', 'shipped_quantity', 'reserved_quantity', 'remaining_quantity'];
const DATE_FIELDS = ['expected_shipment', 'order_date'];

// 表示設定(モデル項目表示設定の「出庫予定」)が未登録、または取得できない場合に使用する既定の列
const DEFAULT_COLUMNS = [
  { model_field_name: 'order_number', verbose_name: '受注番号' },
  { model_field_name: 'item', verbose_name: '品目（品番）' },
  { model_field_name: 'warehouse', verbose_name: '出庫倉庫' },
  { model_field_name: 'purpose', verbose_name: '用途' },
  { model_field_name: 'line', verbose_name: '出庫先ライン' },
  { model_field_name: 'quantity', verbose_name: '予定数量' },
  { model_field_name: 'shipped_quantity', verbose_name: '出庫済' },
  { model_field_name: 'remaining_quantity', verbose_name: '未出庫残' },
  { model_field_name: 'expected_shipment', verbose_name: '出庫予定日' },
];

// ローカル日付(YYYY-MM-DD)。出庫予定の期間フィルタの既定値(今日以降)に使う
const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const DEFAULT_LABELS = new Map<string, string>(DEFAULT_COLUMNS.map(c => [c.model_field_name, c.verbose_name]));

const GoodsIssue: React.FC = () => {
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [committedKeyword, setCommittedKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState(todayLocal);
  const [dateTo, setDateTo] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const workCenters = useWorkCenters();
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [displaySettings, setDisplaySettings] = useState<DisplaySetting[]>([]);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [issueQuantity, setIssueQuantity] = useState('');
  const [modalMessage, setModalMessage] = useState({ text: '', type: '' });

  // Location map modal state
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [mapOrderId, setMapOrderId] = useState<string | null>(null);

  const fetchSalesOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await inventoryService.getIssuableSalesOrders({
        status: 'pending',
        page: currentPage,
        q: committedKeyword.trim() || undefined,
        expectedFrom: dateFrom || undefined,
        expectedTo: dateTo || undefined,
        line: lineFilter || undefined,
      });
      setSalesOrders(data.results || []);
      setTotalPages(data.total_pages || 1);
      setTotalCount(data.count || 0);
    } catch (e) {
      setError('出庫待ち受注データの読み込みに失敗しました。');
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [currentPage, committedKeyword, dateFrom, dateTo, lineFilter]);

  useEffect(() => {
    fetchSalesOrders();
  }, [fetchSalesOrders]);

  // 表示列はモデル項目表示設定(出庫予定)で決める。取得できない・未設定なら既定の列を使う
  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, fieldsRes] = await Promise.all([
          authFetch('/api/base/model-display-settings/?data_type=sales_order'),
          authFetch('/api/base/model-fields/?data_type=sales_order&include_relations=true'),
        ]);
        const settings = settingsRes.ok ? await settingsRes.json() : [];
        const fields = fieldsRes.ok ? await fieldsRes.json() : [];
        const verboseNames = new Map<string, string>();
        (fields as ModelFieldInfo[]).forEach((f) => verboseNames.set(f.name, f.verbose_name));
        const visible = (settings as DisplaySetting[])
          .filter((s) => s.is_list_display)
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
          .map((s) => ({
            ...s,
            // 列名は、既定の列の名前 > モデル項目の名前 > 設定が持つ名前の順に使う
            // (model-fields は管理者専用で、一般ユーザーは取得できない。未出庫残のような計算項目はモデルに無い)
            verbose_name: DEFAULT_LABELS.get(s.model_field_name) || verboseNames.get(s.model_field_name) || s.verbose_name || s.model_field_name,
          }));
        setDisplaySettings(visible);
      } catch (e) {
        console.error('Display settings fetch error:', e);
        setDisplaySettings([]);
      }
    })();
  }, []);

  const columns = displaySettings.length > 0 ? displaySettings : DEFAULT_COLUMNS;
  const colSpan = columns.length + 1;

  // 検索語はサーバー側で絞り込む(入力が止まってから反映し、1ページ目に戻す)
  useEffect(() => {
    const t = setTimeout(() => {
      setCommittedKeyword(prev => {
        if (prev !== keyword) setCurrentPage(1);
        return keyword;
      });
    }, 400);
    return () => clearTimeout(t);
  }, [keyword]);

  const openModal = (order: SalesOrder) => {
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

  const openMapModal = (order: SalesOrder) => {
    setMapOrderId(order.id);
    setIsMapModalOpen(true);
  };

  const closeMapModal = () => {
    setIsMapModalOpen(false);
    setMapOrderId(null);
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalMessage({ text: '', type: '' });

    if (!selectedOrder) return;
    const validationError = validateIssueQuantity(issueQuantity, selectedOrder.remaining_quantity);
    if (validationError) {
      setModalMessage({ text: validationError, type: 'danger' });
      return;
    }

    try {
      const result = await inventoryService.issueSalesOrder(selectedOrder.id, parseInt(issueQuantity, 10));
      if (result.ok) {
        setModalMessage({ text: result.message || '出庫処理が完了しました。', type: 'success' });
        setTimeout(() => {
          closeModal();
          fetchSalesOrders();
        }, 1200);
      } else {
        setModalMessage({ text: result.message || '出庫処理に失敗しました。', type: 'danger' });
      }
    } catch (err) {
      console.error('Error:', err);
      setModalMessage({ text: '通信エラーが発生しました。', type: 'danger' });
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—';
    return dateString.split('T')[0];
  };

  const filteredOrders = salesOrders;

  const renderCell = (order: SalesOrder, fieldName: string, canIssue: boolean) => {
    const record = order as unknown as Record<string, string | number | boolean | null | undefined>;
    switch (fieldName) {
      case 'order_number':
        return <td key={fieldName} className="fw-bold text-dark">{order.order_number || '—'}</td>;
      case 'item':
        return <td key={fieldName} className="fw-semibold">{order.item || '—'}</td>;
      case 'purpose':
        return <td key={fieldName}>{order.purpose || <span className="text-muted">汎用</span>}</td>;
      case 'line':
        return <td key={fieldName}>{order.line || <span className="text-muted">未指定</span>}</td>;
      case 'remaining_quantity':
        return (
          <td key={fieldName} className="text-end">
            <span className={canIssue ? 'receipt-remaining-qty has-remaining' : 'receipt-remaining-qty zero'}>
              {order.remaining_quantity}
            </span>
          </td>
        );
      default: {
        if (DATE_FIELDS.includes(fieldName)) return <td key={fieldName}>{formatDate(record[fieldName] as string | null | undefined)}</td>;
        const raw = record[fieldName];
        const text = raw !== null && raw !== undefined && raw !== '' ? String(raw) : '—';
        return NUMERIC_FIELDS.includes(fieldName)
          ? <td key={fieldName} className="text-end fw-semibold">{text}</td>
          : <td key={fieldName}>{text}</td>;
      }
    }
  };

  const renderTableBody = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan={colSpan} className="text-center py-5">
            <Spinner animation="border" variant="primary" size="sm" className="me-2" />
            <span className="text-muted">出庫待ちデータを読み込んでいます...</span>
          </td>
        </tr>
      );
    }
    if (error) {
      return (
        <tr>
          <td colSpan={colSpan} className="text-center text-danger py-4 fw-bold">
            {error}
          </td>
        </tr>
      );
    }
    if (filteredOrders.length === 0) {
      return (
        <tr>
          <td colSpan={colSpan} className="text-center py-5 text-muted">
            <div className="fw-bold mb-1">出庫待ちの受注データはありません</div>
            <div className="small">すべての出庫予定が完了しているか、該当する受注がありません。</div>
          </td>
        </tr>
      );
    }
    return filteredOrders.map(order => {
      const canIssue = order.remaining_quantity > 0;
      return (
        <tr key={order.id} className={canIssue ? '' : 'receipt-row-completed'}>
          {columns.map((setting: DisplaySetting) => renderCell(order, setting.model_field_name, canIssue))}
          <td className="text-center text-nowrap">
            <button
              type="button"
              className="btn btn-sm btn-primary fw-bold me-1"
              onClick={() => openModal(order)}
              disabled={!canIssue}
            >
              出庫処理
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary fw-bold"
              onClick={() => openMapModal(order)}
            >
              地図で確認
            </button>
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="goods-receipt-page">
      <div className="goods-receipt-filter-panel">
        <div className="receipt-search-inputs-row">
          <div className="receipt-search-field">
            <label className="receipt-search-label" htmlFor="issue-search-input">
              受注番号・品番・倉庫で絞り込み
            </label>
            <input
              id="issue-search-input"
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              className="form-control form-control-sm"
              placeholder="受注番号・品番・倉庫を入力..."
            />
          </div>
          <div className="receipt-search-field">
            <label className="receipt-search-label" htmlFor="issue-date-from">
              出庫予定日（開始）
            </label>
            <input
              id="issue-date-from"
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }}
              className="form-control form-control-sm"
            />
          </div>
          <div className="receipt-search-field">
            <label className="receipt-search-label" htmlFor="issue-date-to">
              出庫予定日（終了）
            </label>
            <input
              id="issue-date-to"
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }}
              className="form-control form-control-sm"
            />
          </div>
          <div className="receipt-search-field">
            <label className="receipt-search-label" htmlFor="issue-line-filter">
              出庫先ライン
            </label>
            <select
              id="issue-line-filter"
              value={lineFilter}
              onChange={e => { setLineFilter(e.target.value); setCurrentPage(1); }}
              className="form-select form-select-sm"
            >
              <option value="">すべて</option>
              <option value="none">未指定</option>
              {workCenters.map(w => (
                <option key={w.code} value={w.code}>{w.code}{w.name ? `（${w.name}）` : ''}</option>
              ))}
            </select>
          </div>
          <div className="receipt-search-actions">
            <button type="button" onClick={fetchSalesOrders} className="btn btn-primary btn-sm fw-bold px-3">
              再読み込み
            </button>
            {(keyword || dateTo || lineFilter || dateFrom !== todayLocal()) && (
              <button
                type="button"
                onClick={() => { setKeyword(''); setDateFrom(todayLocal()); setDateTo(''); setLineFilter(''); setCurrentPage(1); }}
                className="btn btn-outline-secondary btn-sm"
              >
                条件リセット
              </button>
            )}
          </div>
          <span className="receipt-result-count ms-auto">
            出庫待ち件数：<strong>{totalCount}</strong> 件
          </span>
        </div>
      </div>

      <div className="goods-receipt-table-card">
        <div className="table-responsive mb-0">
          <table className="table table-hover align-middle goods-receipt-table mb-0">
            <thead>
              <tr>
                {columns.map((setting: DisplaySetting) => (
                  <th key={setting.model_field_name} className={NUMERIC_FIELDS.includes(setting.model_field_name) ? 'text-end' : ''}>
                    {(setting.display_name || '').trim() || setting.verbose_name || setting.model_field_name}
                  </th>
                ))}
                <th className="text-center" style={{ width: '190px' }}>出庫・操作</th>
              </tr>
            </thead>
            <tbody>{renderTableBody()}</tbody>
          </table>
        </div>
      </div>

      <div className="pagination-controls d-flex justify-content-center align-items-center mt-3">
        <button
          type="button"
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          className="btn btn-outline-primary btn-sm"
          disabled={currentPage <= 1 || loading}
        >
          ← 前へ
        </button>
        <span className="mx-3 small fw-semibold text-secondary">
          {totalCount > 0 ? `ページ ${currentPage} / ${totalPages} （全 ${totalCount} 件）` : '0 件'}
        </span>
        <button
          type="button"
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          className="btn btn-outline-primary btn-sm"
          disabled={currentPage >= totalPages || loading}
        >
          次へ →
        </button>
      </div>

      {selectedOrder && (
        <Modal show={isModalOpen} onHide={closeModal} centered scrollable className="mes-clean-modal">
          <Modal.Header closeButton className="mes-modal-header">
            <div className="mes-modal-title-wrap">
              <span className="mes-modal-icon-box" aria-hidden="true">
                <NavIcon name="issue" size={20} />
              </span>
              <div className="mes-modal-title-text">
                <div className="mes-modal-title-row">
                  <Modal.Title className="mes-modal-title">出庫処理の登録</Modal.Title>
                  <span className="mes-modal-tag-pill">実在庫から引落</span>
                </div>
                <p className="mes-modal-subtitle">
                  今回出庫する数量を確認して「出庫を確定する」を押してください（複数回に分けて出庫することも可能です）。
                </p>
              </div>
            </div>
          </Modal.Header>
          <form onSubmit={handleIssueSubmit}>
            <Modal.Body className="mes-modal-body">
              <div className="receipt-modal-summary-card mb-3">
                <div className="receipt-summary-grid">
                  <div className="receipt-summary-item">
                    <span className="summary-label">受注番号</span>
                    <span className="summary-value fw-bold">{selectedOrder.order_number}</span>
                  </div>
                  <div className="receipt-summary-item">
                    <span className="summary-label">品目（品番）</span>
                    <span className="summary-value fw-bold">{selectedOrder.item}</span>
                  </div>
                  <div className="receipt-summary-item">
                    <span className="summary-label">出庫倉庫</span>
                    <span className="summary-value fw-bold">{selectedOrder.warehouse || '—'}</span>
                  </div>
                  <div className="receipt-summary-item highlight">
                    <span className="summary-label">未出庫の残数量</span>
                    <span className="summary-value text-primary fw-bold fs-6">{selectedOrder.remaining_quantity}</span>
                  </div>
                </div>
              </div>

              <div className="mes-modal-field-group">
                <label htmlFor="quantity_to_ship" className="mes-modal-field-label">
                  <span>今回の出庫数量</span>
                  <span className="mes-field-badge required">必須</span>
                </label>
                <div className="d-flex align-items-center gap-2">
                  <input
                    type="number"
                    id="quantity_to_ship"
                    name="quantity_to_ship"
                    className="form-control mes-modal-input text-end fw-bold"
                    value={issueQuantity}
                    onChange={(e) => setIssueQuantity(e.target.value)}
                    min="1"
                    max={selectedOrder.remaining_quantity}
                    required
                    placeholder={`最大 ${selectedOrder.remaining_quantity}`}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm text-nowrap fw-bold"
                    onClick={() => setIssueQuantity(String(selectedOrder.remaining_quantity))}
                  >
                    残数（{selectedOrder.remaining_quantity}）をセット
                  </button>
                </div>
                <span className="mes-modal-field-help">
                  1〜{selectedOrder.remaining_quantity} の範囲で今回出荷する数量を入力してください
                </span>
              </div>

              {modalMessage.text && (
                <Alert variant={modalMessage.type === 'success' ? 'success' : 'danger'} className="mt-3 mb-0 py-2 small fw-bold">
                  {modalMessage.text}
                </Alert>
              )}
            </Modal.Body>
            <Modal.Footer className="mes-modal-footer">
              <Button variant="outline-secondary" onClick={closeModal}>
                キャンセル
              </Button>
              <Button type="submit" variant="primary" className="fw-bold px-4">
                出庫を確定する
              </Button>
            </Modal.Footer>
          </form>
        </Modal>
      )}

      <WarehouseLocationMapModal isOpen={isMapModalOpen} onClose={closeMapModal} orderId={mapOrderId} />
    </div>
  );
};

export default GoodsIssue;
