import React, { useState, useEffect, useCallback } from 'react';
import { Spinner } from 'react-bootstrap';
import authFetch, { handleError } from '../utils/api';
import { MaterialAllocation, PaginationData } from '../types/production';

const ALLOC_STATUS_TABS = [
  { value: '', label: 'すべて表示' },
  { value: 'ALLOCATED', label: '引当済' },
  { value: 'ISSUED', label: '出庫済' },
  { value: 'RETURNED', label: '返却済' },
];

const MaterialAllocationPage: React.FC = () => {
  const [allocations, setAllocations] = useState<MaterialAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    count: 0,
    next: null as string | null,
    previous: null as string | null,
  });

  const [planFilter, setPlanFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPageUrl, setCurrentPageUrl] = useState('/api/production/material-allocations/');

  const fetchAllocations = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {};
      if (planFilter) params.production_plan_id = planFilter;
      if (materialFilter) params.material_code = materialFilter;
      if (statusFilter) params.status = statusFilter;

      const baseEndpoint = url.split('?')[0];
      const existingQuery = url.split('?')[1] || '';
      const existingParams = new URLSearchParams(existingQuery);

      Object.entries(params).forEach(([key, value]) => {
        existingParams.set(key, value);
      });

      const targetUrl = `${baseEndpoint}?${existingParams.toString()}`;
      const response = await authFetch(targetUrl);
      await handleError(response, '材料引当データの取得に失敗しました。');
      const data = (await response.json()) as PaginationData<MaterialAllocation>;

      setAllocations(data.results || []);
      setPagination({
        count: data.count ?? 0,
        next: data.next ?? null,
        previous: data.previous ?? null,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [planFilter, materialFilter, statusFilter]);

  useEffect(() => {
    fetchAllocations('/api/production/material-allocations/');
  }, [fetchAllocations]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAllocations('/api/production/material-allocations/');
  };

  const handleClear = () => {
    setPlanFilter('');
    setMaterialFilter('');
    setStatusFilter('');
    setCurrentPageUrl('/api/production/material-allocations/');
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const label = newStatus === 'ISSUED' ? '出庫済' : newStatus === 'RETURNED' ? '返却済' : '引当済';
    if (!window.confirm(`ステータスを「${label}」に変更しますか？`)) {
      return;
    }
    try {
      const response = await authFetch(`/api/production/material-allocations/${id}/change-status/`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus }),
      });
      await handleError(response, 'ステータスの更新に失敗しました。');
      fetchAllocations(currentPageUrl);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('この材料引当を削除（引当解除）しますか？')) {
      return;
    }
    try {
      const response = await authFetch(`/api/production/material-allocations/${id}/`, {
        method: 'DELETE',
      });
      await handleError(response, '材料引当の削除に失敗しました。');
      fetchAllocations(currentPageUrl);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const getStatusBadge = (status: string, display: string) => {
    switch (status) {
      case 'ALLOCATED':
        return <span className="receipt-status-badge status-pending">{display || '引当済'}</span>;
      case 'ISSUED':
        return <span className="receipt-status-badge status-completed">{display || '出庫済'}</span>;
      case 'RETURNED':
        return <span className="receipt-status-badge status-canceled">{display || '返却済'}</span>;
      default:
        return <span className="receipt-status-badge">{display || status}</span>;
    }
  };

  return (
    <div className="goods-receipt-page">
      {/* フィルタパネル */}
      <div className="goods-receipt-filter-panel">
        <form onSubmit={handleSearch}>
          <div className="receipt-status-tabs-row mb-2">
            <span className="filter-section-label">状態フィルタ：</span>
            <div className="receipt-status-tabs" role="tablist">
              {ALLOC_STATUS_TABS.map(tab => (
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
              対象件数：<strong>{pagination.count}</strong> 件
            </span>
          </div>

          <div className="receipt-search-inputs-row">
            <div className="receipt-search-field">
              <label className="receipt-search-label" htmlFor="alloc-plan-filter">生産計画ID</label>
              <input
                id="alloc-plan-filter"
                type="text"
                className="form-control form-control-sm"
                placeholder="生産計画IDを入力..."
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
              />
            </div>
            <div className="receipt-search-field">
              <label className="receipt-search-label" htmlFor="alloc-mat-filter">材料コード（品番）</label>
              <input
                id="alloc-mat-filter"
                type="text"
                className="form-control form-control-sm"
                placeholder="材料コードを入力..."
                value={materialFilter}
                onChange={(e) => setMaterialFilter(e.target.value)}
              />
            </div>
            <div className="receipt-search-actions">
              <button type="submit" className="btn btn-primary btn-sm fw-bold px-3">
                検索
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleClear}>
                条件リセット
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* テーブルカード */}
      <div className="goods-receipt-table-card">
        <div className="table-responsive mb-0">
          <table className="table table-hover align-middle goods-receipt-table mb-0">
            <thead>
              <tr>
                <th>生産計画</th>
                <th>材料コード（品番）</th>
                <th className="text-end">引当数量</th>
                <th>引当日時</th>
                <th>状態</th>
                <th>備考</th>
                <th className="text-center" style={{ width: '170px' }}>引当操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-5">
                    <Spinner animation="border" variant="primary" size="sm" className="me-2" />
                    <span className="text-muted">材料引当データを読み込んでいます...</span>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="text-center text-danger py-4 fw-bold">
                    {error}
                  </td>
                </tr>
              ) : allocations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-5 text-muted">
                    条件に一致する材料引当データがありません。
                  </td>
                </tr>
              ) : (
                allocations.map((alloc) => (
                  <tr key={alloc.id}>
                    <td>
                      <div className="fw-bold text-dark">{alloc.production_plan_name || '—'}</div>
                      <small className="text-muted">{alloc.production_plan}</small>
                    </td>
                    <td className="fw-semibold">{alloc.material_code}</td>
                    <td className="text-end">
                      <span className="receipt-remaining-qty has-remaining">{alloc.allocated_quantity}</span>
                    </td>
                    <td>
                      {alloc.allocation_datetime
                        ? new Date(alloc.allocation_datetime).toLocaleString('ja-JP', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td>
                      {getStatusBadge(alloc.status, alloc.status_display)}
                      {alloc.allocation_type === 'ADDITIONAL' && (
                        <span className="badge bg-danger-subtle text-danger-emphasis ms-1">
                          {alloc.allocation_type_display || '追加出庫'}
                        </span>
                      )}
                    </td>
                    <td>{alloc.remarks || '—'}</td>
                    <td className="text-center text-nowrap">
                      {alloc.status === 'ALLOCATED' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary fw-bold me-1"
                          onClick={() => handleUpdateStatus(alloc.id, 'ISSUED')}
                        >
                          出庫
                        </button>
                      )}
                      {alloc.status === 'ISSUED' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary fw-bold me-1"
                          onClick={() => handleUpdateStatus(alloc.id, 'RETURNED')}
                        >
                          返却
                        </button>
                      )}
                      {alloc.status === 'ALLOCATED' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger fw-bold"
                          onClick={() => handleDelete(alloc.id)}
                        >
                          解除
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ページネーション */}
      <div className="pagination-controls d-flex justify-content-center align-items-center mt-2">
        <button
          type="button"
          className="btn btn-outline-primary btn-sm"
          disabled={!pagination.previous}
          onClick={() => {
            setCurrentPageUrl(pagination.previous!);
            fetchAllocations(pagination.previous!);
          }}
        >
          ← 前へ
        </button>
        <span className="mx-3 small fw-semibold text-secondary">
          全 {pagination.count} 件
        </span>
        <button
          type="button"
          className="btn btn-outline-primary btn-sm"
          disabled={!pagination.next}
          onClick={() => {
            setCurrentPageUrl(pagination.next!);
            fetchAllocations(pagination.next!);
          }}
        >
          次へ →
        </button>
      </div>
    </div>
  );
};

export default MaterialAllocationPage;
