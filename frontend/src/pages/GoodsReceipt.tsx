import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Spinner, Alert } from 'react-bootstrap';
import { useStockPurposes } from '../hooks/useStockPurposes';
import ReceiptLocationMap from '../components/common/ReceiptLocationMap';
import authFetch, { ApiError } from '../utils/api';
import inventoryService from '../services/inventoryService';
import { NavIcon } from '../config/navigationConfig';
import './InventoryInquiry.css';
import type { DisplaySetting, ModelFieldInfo, PurchaseOrderRow } from './types/listPage';

const NUMERIC_FIELDS = ['quantity', 'received_quantity', 'remaining_quantity', 'delivered_quantity'];

// 表示設定が未登録、または取得できない(管理者以外など)場合に使用する既定の列
const DEFAULT_COLUMNS = [
  { model_field_name: 'order_number', verbose_name: '発注番号' },
  { model_field_name: 'supplier', verbose_name: '仕入先' },
  { model_field_name: 'item', verbose_name: '品番・品目' },
  { model_field_name: 'product_name', verbose_name: '品名' },
  { model_field_name: 'warehouse', verbose_name: '入庫倉庫' },
  { model_field_name: 'location', verbose_name: '棚番' },
  { model_field_name: 'quantity', verbose_name: '発注数' },
  { model_field_name: 'received_quantity', verbose_name: '入庫済' },
  { model_field_name: 'remaining_quantity', verbose_name: '未入庫残' },
  { model_field_name: 'expected_arrival', verbose_name: '入荷予定日' },
  { model_field_name: 'status', verbose_name: '状態' },
];

const DEFAULT_SEARCH_FIELDS = [
  { model_field_name: 'order_number', verbose_name: '発注番号', display_name: '発注番号' },
  { model_field_name: 'item', verbose_name: '品番・品目', display_name: '品番・品目' },
  { model_field_name: 'supplier', verbose_name: '仕入先', display_name: '仕入先' },
];

const STATUS_TABS = [
  { value: 'pending', label: '未入庫', badgeClass: 'status-tab-pending' },
  { value: 'partially_received', label: '一部入庫', badgeClass: 'status-tab-partial' },
  { value: 'fully_received', label: '全量入庫済み', badgeClass: 'status-tab-full' },
  { value: '', label: 'すべて表示', badgeClass: 'status-tab-all' },
  { value: 'canceled', label: 'キャンセル', badgeClass: 'status-tab-canceled' },
];

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '未入庫', className: 'receipt-status-badge status-pending' },
  partially_received: { label: '一部入庫', className: 'receipt-status-badge status-partial' },
  fully_received: { label: '全量入庫済み', className: 'receipt-status-badge status-completed' },
  canceled: { label: 'キャンセル', className: 'receipt-status-badge status-canceled' },
};

// ローカル日付(YYYY-MM-DD)。入庫予定の期間フィルタの既定値(今日以降)に使う
const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const defaultFilters = (): Record<string, string> => ({
  status: 'pending',
  expected_arrival_from: todayLocal(),
});

const GoodsReceipt: React.FC = () => {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
  const [pagination, setPagination] = useState<{
    count: number;
    next: string | null;
    previous: string | null;
    currentPage: number;
    totalPages: number;
  }>({
    count: 0,
    next: null,
    previous: null,
    currentPage: 1,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displaySettings, setDisplaySettings] = useState<DisplaySetting[]>([]);
  const [searchFields, setSearchFields] = useState<DisplaySetting[]>([]);

  const [filters, setFilters] = useState<Record<string, string>>(defaultFilters);

  // 入庫処理モーダル
  const [receiptModal, setReceiptModal] = useState<{
    isOpen: boolean;
    order: PurchaseOrderRow | null;
    error: string;
    success: string;
  }>({ isOpen: false, order: null, error: '', success: '' });
  const stockPurposes = useStockPurposes();
  const [receiptFormData, setReceiptFormData] = useState({
    received_quantity: '',
    location: '',
    warehouse: '',
    purpose: '',
  });

  // 納品記録モーダル
  const [deliveryModal, setDeliveryModal] = useState<{
    isOpen: boolean;
    order: PurchaseOrderRow | null;
    error: string;
    success: string;
  }>({ isOpen: false, order: null, error: '', success: '' });
  const [deliveryFormData, setDeliveryFormData] = useState({
    delivery_date: '',
    delivered_quantity: '',
  });

  const fetchPurchaseOrders = useCallback(async (pageUrl: string | null = null) => {
    setIsLoading(true);
    setError(null);

    let dataApiUrl: string;
    if (pageUrl) {
      try {
        const url = new URL(pageUrl);
        dataApiUrl = url.pathname + url.search;
      } catch (_err) {
        dataApiUrl = pageUrl;
      }
    } else {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value) {
          params.append(`search_${key}`, value);
        }
      }
      dataApiUrl = `/api/inventory/purchase-orders/?${params.toString()}`;
    }

    const poSettingsUrl = '/api/base/model-display-settings/?data_type=purchase_order';
    const grSettingsUrl = '/api/base/model-display-settings/?data_type=goods_receipt';
    const poFieldsUrl = '/api/base/model-fields/?data_type=purchase_order&include_relations=true';
    const grFieldsUrl = '/api/base/model-fields/?data_type=goods_receipt&include_relations=true';

    try {
      const [poSettingsResponse, grSettingsResponse, dataResponse, poFieldsResponse, grFieldsResponse] = await Promise.all([
        authFetch(poSettingsUrl),
        authFetch(grSettingsUrl),
        authFetch(dataApiUrl),
        authFetch(poFieldsUrl),
        authFetch(grFieldsUrl),
      ]);

      const poSettings = poSettingsResponse.ok ? await poSettingsResponse.json() : [];
      const grSettings = grSettingsResponse.ok ? await grSettingsResponse.json() : [];
      const poFields = poFieldsResponse.ok ? await poFieldsResponse.json() : [];
      const grFields = grFieldsResponse.ok ? await grFieldsResponse.json() : [];

      const verboseNameMap = new Map<string, string>();
      const fieldTypeMap = new Map<string, string | undefined>();

      (poFields as ModelFieldInfo[]).forEach((field) => {
        verboseNameMap.set(field.name, field.verbose_name);
        fieldTypeMap.set(field.name, field.field_type);
      });
      (grFields as ModelFieldInfo[]).forEach((field) => {
        if (!verboseNameMap.has(field.name)) {
          verboseNameMap.set(field.name, field.verbose_name);
          fieldTypeMap.set(field.name, field.field_type);
        }
      });

      if (poSettingsResponse.ok && grSettingsResponse.ok) {
        const settingsMap = new Map<string, DisplaySetting>();
        (poSettings as DisplaySetting[]).forEach((setting) => {
          settingsMap.set(setting.model_field_name, setting);
        });
        (grSettings as DisplaySetting[]).forEach((setting) => {
          settingsMap.set(setting.model_field_name, setting);
        });

        const mergedSettings = Array.from(settingsMap.values());
        const combinedSettings = mergedSettings.map((setting): DisplaySetting => ({
          ...setting,
          verbose_name: verboseNameMap.get(setting.model_field_name) || setting.verbose_name || setting.model_field_name,
          field_type: fieldTypeMap.get(setting.model_field_name) || 'Unknown',
        }));

        const visibleColumns = combinedSettings
          .filter((s) => s.is_list_display)
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        setDisplaySettings(visibleColumns);

        const searchableFields = combinedSettings
          .filter((s) => s.is_search_field)
          .sort((a, b) => (a.search_order ?? 0) - (b.search_order ?? 0));
        setSearchFields(searchableFields);
      } else {
        setDisplaySettings([]);
        setSearchFields([]);
      }

      if (!dataResponse.ok) {
        throw new Error(`Network response was not ok: ${dataResponse.statusText}`);
      }
      const data = await dataResponse.json();
      setPurchaseOrders(data.results || []);
      setPagination({
        count: data.count ?? 0,
        next: data.next ?? null,
        previous: data.previous ?? null,
        currentPage: data.current_page ?? 1,
        totalPages: data.total_pages ?? 1,
      });
    } catch (err) {
      setError('入庫予定データの取得中にエラーが発生しました。');
      console.error('Error fetching data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchPurchaseOrders();
  }, [fetchPurchaseOrders]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleStatusTabClick = (statusValue: string) => {
    setFilters(prev => ({ ...prev, status: statusValue }));
  };

  const handleClearFilters = () => {
    setFilters(defaultFilters());
  };

  const handleSearch = () => {
    fetchPurchaseOrders();
  };

  // 入庫処理モーダルの開閉
  const openReceiptModal = (order: PurchaseOrderRow) => {
    const remainingQuantity = (order.quantity ?? 0) - (order.received_quantity ?? 0);
    setReceiptModal({ isOpen: true, order, error: '', success: '' });
    setReceiptFormData({
      received_quantity: remainingQuantity > 0 ? String(remainingQuantity) : '',
      location: order.location || '',
      warehouse: order.warehouse || '',
      purpose: order.purpose || '',
    });
  };

  const closeReceiptModal = () => {
    setReceiptModal({ isOpen: false, order: null, error: '', success: '' });
  };

  const handleReceiptFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setReceiptFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReceiptModal(prev => ({ ...prev, error: '', success: '' }));

    const receivedQuantity = parseInt(String(receiptFormData.received_quantity), 10);
    if (isNaN(receivedQuantity) || receivedQuantity <= 0) {
      setReceiptModal(prev => ({ ...prev, error: '入庫数量は1以上の整数を入力してください。' }));
      return;
    }

    const targetOrder = receiptModal.order;
    if (!targetOrder) return;
    const location = receiptFormData.location.trim();
    const registerDefaultLocation = await inventoryService.confirmRegisterDefaultLocation(
      targetOrder,
      location
    );

    try {
      const result = await inventoryService.receivePurchaseOrder({
        purchase_order_id: targetOrder.id,
        received_quantity: receivedQuantity,
        register_default_location: registerDefaultLocation,
        location,
        warehouse: receiptFormData.warehouse.trim(),
        purpose: receiptFormData.purpose,
      });
      setReceiptModal(prev => ({
        ...prev,
        success: `発注番号「${result.order_number || targetOrder.order_number}」の入庫処理が完了し、在庫へ反映されました。${result.default_location_registered ? `デフォルト入庫棚番に「${location}」を登録しました。` : ''}`,
      }));
      setTimeout(() => {
        closeReceiptModal();
        fetchPurchaseOrders();
      }, 1200);
    } catch (err) {
      console.error('Error submitting purchase receipt:', err);
      setReceiptModal(prev => ({
        ...prev,
        error: err instanceof ApiError ? err.message : '入庫処理中に通信エラーが発生しました。',
      }));
    }
  };

  // 納品記録モーダルの開閉
  const openDeliveryModal = (order: PurchaseOrderRow) => {
    setDeliveryModal({ isOpen: true, order, error: '', success: '' });
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setDeliveryFormData({
      delivery_date: order.delivery_date || today,
      delivered_quantity: String(order.delivered_quantity ?? order.quantity ?? ''),
    });
  };

  const closeDeliveryModal = () => {
    setDeliveryModal({ isOpen: false, order: null, error: '', success: '' });
  };

  const handleDeliveryFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDeliveryFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDeliverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeliveryModal(prev => ({ ...prev, error: '', success: '' }));

    const quantityText = String(deliveryFormData.delivered_quantity).trim();
    const deliveredQuantity = quantityText === '' ? null : parseInt(quantityText, 10);
    if (deliveredQuantity !== null && (isNaN(deliveredQuantity) || deliveredQuantity < 0)) {
      setDeliveryModal(prev => ({ ...prev, error: '納品数は0以上の整数を入力してください。' }));
      return;
    }

    const targetOrder = deliveryModal.order;
    if (!targetOrder) return;

    try {
      await inventoryService.updatePurchaseOrderDelivery(targetOrder.id, {
        delivery_date: deliveryFormData.delivery_date || null,
        delivered_quantity: deliveredQuantity,
      });
      setDeliveryModal(prev => ({
        ...prev,
        success: `発注番号「${targetOrder.order_number}」の納品記録を保存しました。`,
      }));
      setTimeout(() => {
        closeDeliveryModal();
        fetchPurchaseOrders();
      }, 1200);
    } catch (err) {
      console.error('Error updating delivery info:', err);
      setDeliveryModal(prev => ({
        ...prev,
        error: err instanceof ApiError ? err.message : '納品記録の更新中に通信エラーが発生しました。',
      }));
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const columns = displaySettings.length > 0 ? displaySettings : DEFAULT_COLUMNS;
  const activeSearchFields =
    searchFields.filter((f) => f.model_field_name !== 'status').length > 0
      ? searchFields.filter((f) => f.model_field_name !== 'status')
      : DEFAULT_SEARCH_FIELDS;
  const colSpan = columns.length + 1;

  const renderTableHeaders = () => (
    <tr>
      {columns.map((setting: DisplaySetting) => {
        const isNumeric = NUMERIC_FIELDS.includes(setting.model_field_name);
        const headerText = (setting.display_name || '').trim() || setting.verbose_name || setting.model_field_name;
        return (
          <th key={setting.model_field_name} className={isNumeric ? 'text-end' : ''}>
            {headerText}
          </th>
        );
      })}
      <th className="text-center" style={{ width: '170px' }}>入庫・操作</th>
    </tr>
  );

  const renderTableBody = () => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan={colSpan} className="text-center py-5">
            <Spinner animation="border" variant="primary" size="sm" className="me-2" />
            <span className="text-muted">入庫予定データを読み込んでいます...</span>
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
    if (purchaseOrders.length === 0) {
      return (
        <tr>
          <td colSpan={colSpan} className="text-center py-5 text-muted">
            <div className="fw-bold mb-1">該当する入庫予定データがありません</div>
            <div className="small">上のステータスタブ（「すべて表示」など）や検索条件を切り替えてご確認ください。</div>
          </td>
        </tr>
      );
    }

    return purchaseOrders.map((order) => {
      const remainingQty = (order.quantity ?? 0) - (order.received_quantity ?? 0);
      const canReceive = ['pending', 'partially_received'].includes(order.status) && remainingQty > 0;

      const cells = columns.map((setting: DisplaySetting) => {
        const fieldName = setting.model_field_name;

        if (fieldName === 'remaining_quantity') {
          return (
            <td key={fieldName} className="text-end">
              <span className={remainingQty > 0 ? 'receipt-remaining-qty has-remaining' : 'receipt-remaining-qty zero'}>
                {remainingQty}
              </span>
            </td>
          );
        }

        if (fieldName === 'expected_arrival' || fieldName === 'order_date') {
          return <td key={fieldName}>{formatDate(order[fieldName] as string | null | undefined)}</td>;
        }

        if (fieldName === 'status') {
          const meta = STATUS_META[order.status] || {
            label: order.status || '—',
            className: 'receipt-status-badge',
          };
          return (
            <td key={fieldName}>
              <span className={meta.className}>{meta.label}</span>
            </td>
          );
        }

        if (fieldName === 'order_number') {
          return (
            <td key={fieldName} className="fw-bold text-dark">
              {order[fieldName] || '—'}
            </td>
          );
        }

        const rawVal = order[fieldName];
        const isNumeric = NUMERIC_FIELDS.includes(fieldName);
        return (
          <td key={fieldName} className={isNumeric ? 'text-end fw-semibold' : ''}>
            {rawVal !== null && rawVal !== undefined && rawVal !== '' ? rawVal : '—'}
          </td>
        );
      });

      return (
        <tr key={order.id} className={canReceive ? '' : 'receipt-row-completed'}>
          {cells}
          <td className="text-center text-nowrap">
            <button
              type="button"
              className={`btn btn-sm fw-bold ${canReceive ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => openReceiptModal(order)}
              disabled={!canReceive}
            >
              {canReceive ? '入庫処理' : '入庫済'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary ms-1"
              onClick={() => openDeliveryModal(order)}
              title="仕入先からの納品日・納品数の控えを記録します"
            >
              納品記録
            </button>
          </td>
        </tr>
      );
    });
  };

  const activeOrderRemaining = receiptModal.order
    ? (receiptModal.order.quantity ?? 0) - (receiptModal.order.received_quantity ?? 0)
    : 0;

  return (
    <div className="inventory-inquiry goods-receipt-page">
      {/* 絞り込み・検索パネル */}
      <div className="goods-receipt-filter-panel">
        <div className="receipt-status-tabs-row">
          <span className="filter-section-label">状態フィルタ：</span>
          <div className="receipt-status-tabs" role="tablist" aria-label="入庫状態フィルタ">
            {STATUS_TABS.map(tab => {
              const isActive = (filters.status ?? '') === tab.value;
              return (
                <button
                  key={tab.value || 'all'}
                  type="button"
                  className={`receipt-status-tab ${tab.badgeClass} ${isActive ? 'active' : ''}`}
                  onClick={() => handleStatusTabClick(tab.value)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <span className="receipt-result-count ms-auto">
            対象件数：<strong>{pagination.count}</strong> 件
          </span>
        </div>

        <div className="receipt-search-inputs-row">
          {activeSearchFields.map((field: DisplaySetting) => {
            const labelText = (field.display_name || '').trim() || field.verbose_name || field.model_field_name;
            return (
              <div key={field.model_field_name} className="receipt-search-field">
                <label className="receipt-search-label" htmlFor={`search-${field.model_field_name}`}>
                  {labelText}
                </label>
                <input
                  id={`search-${field.model_field_name}`}
                  type="text"
                  name={field.model_field_name}
                  value={filters[field.model_field_name] || ''}
                  onChange={handleFilterChange}
                  className="form-control form-control-sm"
                  placeholder={`${labelText}を入力...`}
                />
              </div>
            );
          })}
          <div className="receipt-search-field">
            <label className="receipt-search-label" htmlFor="search-expected_arrival_from">
              入荷予定日（開始）
            </label>
            <input
              id="search-expected_arrival_from"
              type="date"
              name="expected_arrival_from"
              value={filters.expected_arrival_from || ''}
              onChange={handleFilterChange}
              className="form-control form-control-sm"
            />
          </div>
          <div className="receipt-search-field">
            <label className="receipt-search-label" htmlFor="search-expected_arrival_to">
              入荷予定日（終了）
            </label>
            <input
              id="search-expected_arrival_to"
              type="date"
              name="expected_arrival_to"
              value={filters.expected_arrival_to || ''}
              onChange={handleFilterChange}
              className="form-control form-control-sm"
            />
          </div>
          <div className="receipt-search-actions">
            <button type="button" onClick={handleSearch} className="btn btn-primary btn-sm fw-bold px-3">
              検索
            </button>
            <button type="button" onClick={handleClearFilters} className="btn btn-outline-secondary btn-sm">
              条件リセット
            </button>
          </div>
        </div>
      </div>

      {/* 入庫予定テーブル */}
      <div className="goods-receipt-table-card">
        <div className="table-responsive mb-0">
          <table className="table table-hover align-middle goods-receipt-table mb-0">
            <thead>{renderTableHeaders()}</thead>
            <tbody>{renderTableBody()}</tbody>
          </table>
        </div>
      </div>

      {/* ページネーション */}
      <div className="pagination-controls d-flex justify-content-center align-items-center mt-3">
        <button
          type="button"
          onClick={() => fetchPurchaseOrders(pagination.previous)}
          className="btn btn-outline-primary btn-sm"
          disabled={!pagination.previous}
        >
          ← 前へ
        </button>
        <span className="mx-3 small fw-semibold text-secondary">
          {pagination.count > 0
            ? `ページ ${pagination.currentPage} / ${pagination.totalPages} （全 ${pagination.count} 件）`
            : '0 件'}
        </span>
        <button
          type="button"
          onClick={() => fetchPurchaseOrders(pagination.next)}
          className="btn btn-outline-primary btn-sm"
          disabled={!pagination.next}
        >
          次へ →
        </button>
      </div>

      {/* 入庫処理の登録ポップアップ */}
      <Modal
        show={receiptModal.isOpen}
        onHide={closeReceiptModal}
        size="lg"
        centered
        scrollable
        className="mes-clean-modal"
      >
        <Modal.Header closeButton className="mes-modal-header">
          <div className="mes-modal-title-wrap">
            <span className="mes-modal-icon-box" aria-hidden="true">
              <NavIcon name="receipt" size={20} />
            </span>
            <div className="mes-modal-title-text">
              <div className="mes-modal-title-row">
                <Modal.Title className="mes-modal-title">入庫処理の登録</Modal.Title>
                <span className="mes-modal-tag-pill">実在庫へ反映</span>
              </div>
              <p className="mes-modal-subtitle">
                今回入荷した数量と、入庫先の倉庫・棚番を確認して「入庫を確定する」を押してください。
              </p>
            </div>
          </div>
        </Modal.Header>
        <form onSubmit={handleReceiptSubmit}>
          <Modal.Body className="mes-modal-body">
            {receiptModal.order && (
              <div className="receipt-modal-summary-card mb-3">
                <div className="receipt-summary-grid">
                  <div className="receipt-summary-item">
                    <span className="summary-label">発注番号</span>
                    <span className="summary-value fw-bold">{receiptModal.order.order_number || '—'}</span>
                  </div>
                  <div className="receipt-summary-item">
                    <span className="summary-label">品番 / 品名</span>
                    <span className="summary-value fw-bold">
                      {receiptModal.order.item || '—'}
                      {receiptModal.order.product_name ? ` （${receiptModal.order.product_name}）` : ''}
                    </span>
                  </div>
                  <div className="receipt-summary-item">
                    <span className="summary-label">仕入先</span>
                    <span className="summary-value">{receiptModal.order.supplier || '—'}</span>
                  </div>
                  <div className="receipt-summary-item">
                    <span className="summary-label">発注数量 / 入庫済</span>
                    <span className="summary-value">
                      {receiptModal.order.quantity ?? 0} / {receiptModal.order.received_quantity ?? 0}
                    </span>
                  </div>
                  <div className="receipt-summary-item highlight">
                    <span className="summary-label">未入庫の残数量</span>
                    <span className="summary-value text-primary fw-bold fs-6">{activeOrderRemaining}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="row g-3">
              <div className="col-12">
                <div className="mes-modal-field-group">
                  <label htmlFor="modal_received_quantity_input" className="mes-modal-field-label">
                    <span>今回の入庫数量</span>
                    <span className="mes-field-badge required">必須</span>
                  </label>
                  <div className="d-flex align-items-center gap-2">
                    <input
                      type="number"
                      id="modal_received_quantity_input"
                      name="received_quantity"
                      value={receiptFormData.received_quantity}
                      onChange={handleReceiptFormChange}
                      className="form-control mes-modal-input text-end fw-bold"
                      required
                      min="1"
                      max={activeOrderRemaining > 0 ? activeOrderRemaining : undefined}
                    />
                    {activeOrderRemaining > 0 && (
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm text-nowrap fw-bold"
                        onClick={() =>
                          setReceiptFormData(prev => ({
                            ...prev,
                            received_quantity: String(activeOrderRemaining),
                          }))
                        }
                      >
                        残数（{activeOrderRemaining}）をセット
                      </button>
                    )}
                  </div>
                  <span className="mes-modal-field-help">
                    1〜{activeOrderRemaining} の範囲で今回入庫する数量を入力します（分納の場合は入荷分のみ入力可能）
                  </span>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="mes-modal-field-group">
                  <label htmlFor="modal_warehouse_input" className="mes-modal-field-label">
                    <span>入庫先の倉庫番号</span>
                    <span className="mes-field-badge optional">変更可</span>
                  </label>
                  <input
                    type="text"
                    id="modal_warehouse_input"
                    name="warehouse"
                    value={receiptFormData.warehouse}
                    onChange={handleReceiptFormChange}
                    className="form-control mes-modal-input"
                    placeholder="例：FG-MAIN / W001"
                  />
                  <span className="mes-modal-field-help">発注時の指定倉庫から変更する場合に入力します</span>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="mes-modal-field-group">
                  <label htmlFor="modal_location_input" className="mes-modal-field-label">
                    <span>入庫先の棚番</span>
                    <span className="mes-field-badge optional">変更可</span>
                  </label>
                  <input
                    type="text"
                    id="modal_location_input"
                    name="location"
                    value={receiptFormData.location}
                    onChange={handleReceiptFormChange}
                    className="form-control mes-modal-input"
                    placeholder="例：A-01"
                  />
                  <span className="mes-modal-field-help">保管するロケーション（棚番）を入力します</span>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="mes-modal-field-group">
                  <label htmlFor="modal_purpose_select" className="mes-modal-field-label">
                    <span>用途</span>
                    <span className="mes-field-badge optional">変更可</span>
                  </label>
                  <select
                    id="modal_purpose_select"
                    className="form-select mes-modal-input"
                    value={receiptFormData.purpose}
                    onChange={e => setReceiptFormData(prev => ({ ...prev, purpose: e.target.value }))}
                  >
                    <option value="">汎用（用途の指定なし）</option>
                    {stockPurposes.map(p => (
                      <option key={p.code} value={p.code}>{p.code} - {p.name}</option>
                    ))}
                  </select>
                  <span className="mes-modal-field-help">何用の部品として入庫するか。用途ごとに別の在庫として管理されます</span>
                </div>
              </div>

              <div className="col-12">
                <ReceiptLocationMap warehouse={receiptFormData.warehouse} location={receiptFormData.location} />
              </div>
            </div>

            {receiptModal.error && (
              <Alert variant="danger" className="mt-3 mb-0 py-2 small">
                {receiptModal.error}
              </Alert>
            )}
            {receiptModal.success && (
              <Alert variant="success" className="mt-3 mb-0 py-2 small fw-bold">
                {receiptModal.success}
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer className="mes-modal-footer">
            <Button variant="outline-secondary" onClick={closeReceiptModal}>
              キャンセル
            </Button>
            <Button type="submit" variant="primary" className="fw-bold px-4">
              入庫を確定する
            </Button>
          </Modal.Footer>
        </form>
      </Modal>

      {/* 納品記録（受領メモ）の編集ポップアップ */}
      <Modal
        show={deliveryModal.isOpen}
        onHide={closeDeliveryModal}
        centered
        scrollable
        className="mes-clean-modal"
      >
        <Modal.Header closeButton className="mes-modal-header">
          <div className="mes-modal-title-wrap">
            <span className="mes-modal-icon-box" aria-hidden="true">
              <NavIcon name="clipboard-check" size={20} />
            </span>
            <div className="mes-modal-title-text">
              <div className="mes-modal-title-row">
                <Modal.Title className="mes-modal-title">納品記録の編集</Modal.Title>
                <span className="mes-modal-tag-pill">受領メモ（在庫反映なし）</span>
              </div>
              <p className="mes-modal-subtitle">
                仕入先からの納品日・納品数の控えを記録します（※実在庫を増やす場合は「入庫処理」を行ってください）。
              </p>
            </div>
          </div>
        </Modal.Header>
        <form onSubmit={handleDeliverySubmit}>
          <Modal.Body className="mes-modal-body">
            {deliveryModal.order && (
              <div className="receipt-modal-summary-card mb-3">
                <div className="receipt-summary-grid">
                  <div className="receipt-summary-item">
                    <span className="summary-label">発注番号</span>
                    <span className="summary-value fw-bold">{deliveryModal.order.order_number || '—'}</span>
                  </div>
                  <div className="receipt-summary-item">
                    <span className="summary-label">品番 / 品名</span>
                    <span className="summary-value fw-bold">
                      {deliveryModal.order.item || '—'}
                      {deliveryModal.order.product_name ? ` （${deliveryModal.order.product_name}）` : ''}
                    </span>
                  </div>
                  <div className="receipt-summary-item">
                    <span className="summary-label">発注数量</span>
                    <span className="summary-value fw-bold">{deliveryModal.order.quantity ?? 0}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="row g-3">
              <div className="col-12 col-md-6">
                <div className="mes-modal-field-group">
                  <label htmlFor="modal_delivery_date_input" className="mes-modal-field-label">
                    <span>納品日</span>
                    <span className="mes-field-badge optional">任意</span>
                  </label>
                  <input
                    type="date"
                    id="modal_delivery_date_input"
                    name="delivery_date"
                    value={deliveryFormData.delivery_date}
                    onChange={handleDeliveryFormChange}
                    className="form-control mes-modal-input"
                  />
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div className="mes-modal-field-group">
                  <label htmlFor="modal_delivered_quantity_input" className="mes-modal-field-label">
                    <span>納品数</span>
                    <span className="mes-field-badge optional">任意</span>
                  </label>
                  <input
                    type="number"
                    id="modal_delivered_quantity_input"
                    name="delivered_quantity"
                    value={deliveryFormData.delivered_quantity}
                    onChange={handleDeliveryFormChange}
                    className="form-control mes-modal-input text-end fw-bold"
                    min="0"
                  />
                </div>
              </div>
            </div>

            {deliveryModal.error && (
              <Alert variant="danger" className="mt-3 mb-0 py-2 small">
                {deliveryModal.error}
              </Alert>
            )}
            {deliveryModal.success && (
              <Alert variant="success" className="mt-3 mb-0 py-2 small fw-bold">
                {deliveryModal.success}
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer className="mes-modal-footer">
            <Button variant="outline-secondary" onClick={closeDeliveryModal}>
              キャンセル
            </Button>
            <Button type="submit" variant="primary" className="fw-bold px-4">
              納品記録を保存する
            </Button>
          </Modal.Footer>
        </form>
      </Modal>
    </div>
  );
};

export default GoodsReceipt;
