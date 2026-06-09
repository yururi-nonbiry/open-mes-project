import { useState, useEffect, useCallback } from 'react';
import authFetch, { handleError } from '../utils/api';
import { MaterialAllocation, PaginationData } from '../types/production';

const MaterialAllocationPage = () => {
  const [allocations, setAllocations] = useState<MaterialAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    count: 0,
    next: null as string | null,
    previous: null as string | null,
  });

  // Filters
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
      
      // Merge params
      Object.entries(params).forEach(([key, value]) => {
        existingParams.set(key, value);
      });
      
      const targetUrl = `${baseEndpoint}?${existingParams.toString()}`;
      const response = await authFetch(targetUrl);
      await handleError(response, '材料引当データの取得に失敗しました。');
      const data = await response.json() as PaginationData<MaterialAllocation>;
      
      setAllocations(data.results);
      setPagination({
        count: data.count,
        next: data.next,
        previous: data.previous,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [planFilter, materialFilter, statusFilter]);

  useEffect(() => {
    fetchAllocations('/api/production/material-allocations/');
  }, [planFilter, materialFilter, statusFilter]);

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
    if (!window.confirm(`ステータスを「${newStatus === 'ISSUED' ? '出庫済' : newStatus === 'RETURNED' ? '返却済' : '引当済'}」に変更しますか？`)) {
      return;
    }
    try {
      const response = await authFetch(`/api/production/material-allocations/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      await handleError(response, 'ステータスの更新に失敗しました。');
      // Refresh current list
      fetchAllocations(currentPageUrl);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('この材料引当を削除（リリース）しますか？')) {
      return;
    }
    try {
      const response = await authFetch(`/api/production/material-allocations/${id}/`, {
        method: 'DELETE',
      });
      await handleError(response, '材料引当の削除に失敗しました。');
      // Refresh current list
      fetchAllocations(currentPageUrl);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const getStatusBadge = (status: string, display: string) => {
    switch (status) {
      case 'ALLOCATED':
        return <span className="badge bg-warning text-dark"><i className="bi bi-bookmark-fill me-1"></i>{display}</span>;
      case 'ISSUED':
        return <span className="badge bg-success"><i className="bi bi-box-arrow-up-right me-1"></i>{display}</span>;
      case 'RETURNED':
        return <span className="badge bg-secondary"><i className="bi bi-arrow-counterclockwise me-1"></i>{display}</span>;
      default:
        return <span className="badge bg-light text-dark">{display}</span>;
    }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold text-dark">材料引当ステータス一覧</h2>
          <p className="text-muted mb-0">生産計画に基づく材料の引当・出庫・返却状況を確認・更新します。</p>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card border-0 shadow-sm rounded-3 mb-4">
        <div className="card-body p-4">
          <form onSubmit={handleSearch} className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label fw-semibold text-secondary">生産計画ID</label>
              <input
                type="text"
                className="form-control border-secondary-subtle"
                placeholder="生産計画IDで検索"
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-semibold text-secondary">材料コード</label>
              <input
                type="text"
                className="form-control border-secondary-subtle"
                placeholder="材料コードで検索"
                value={materialFilter}
                onChange={(e) => setMaterialFilter(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-semibold text-secondary">ステータス</label>
              <select
                className="form-select border-secondary-subtle"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">全ステータス</option>
                <option value="ALLOCATED">引当済</option>
                <option value="ISSUED">出庫済</option>
                <option value="RETURNED">返却済</option>
              </select>
            </div>
            <div className="col-md-2 d-flex gap-2">
              <button type="submit" className="btn btn-primary w-100 py-2">
                <i className="bi bi-search me-1"></i>検索
              </button>
              <button type="button" className="btn btn-outline-secondary w-100 py-2" onClick={handleClear}>
                クリア
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Table Card */}
      <div className="card border-0 shadow-sm rounded-3">
        <div className="card-body p-0">
          {error && <div className="alert alert-danger m-3">{error}</div>}

          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">読み込み中...</span>
              </div>
              <p className="mt-2 text-muted">データをロードしています...</p>
            </div>
          ) : allocations.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-info-circle fs-3 d-block mb-2"></i>
              条件に一致する材料引当データが見つかりませんでした。
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light py-3">
                  <tr>
                    <th className="ps-4 border-0">生産計画</th>
                    <th className="border-0">材料コード</th>
                    <th className="border-0">引当数量</th>
                    <th className="border-0">引当日時</th>
                    <th className="border-0">ステータス</th>
                    <th className="border-0">備考</th>
                    <th className="pe-4 border-0 text-end">アクション</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((alloc) => (
                    <tr key={alloc.id}>
                      <td className="ps-4">
                        <div className="fw-semibold text-dark">{alloc.production_plan_name}</div>
                        <small className="text-muted text-break">{alloc.production_plan}</small>
                      </td>
                      <td>
                        <span className="font-monospace fw-bold text-secondary">{alloc.material_code}</span>
                      </td>
                      <td className="fw-bold">{alloc.allocated_quantity}</td>
                      <td>
                        <small>{new Date(alloc.allocation_datetime).toLocaleString()}</small>
                      </td>
                      <td>{getStatusBadge(alloc.status, alloc.status_display)}</td>
                      <td>
                        <span className="text-truncate d-inline-block" style={{ maxWidth: '150px' }} title={alloc.remarks || ''}>
                          {alloc.remarks || '-'}
                        </span>
                      </td>
                      <td className="pe-4 text-end">
                        <div className="btn-group btn-group-sm">
                          {alloc.status === 'ALLOCATED' && (
                            <button
                              className="btn btn-outline-success"
                              onClick={() => handleUpdateStatus(alloc.id, 'ISSUED')}
                              title="出庫済にする"
                            >
                              出庫
                            </button>
                          )}
                          {alloc.status === 'ISSUED' && (
                            <button
                              className="btn btn-outline-secondary"
                              onClick={() => handleUpdateStatus(alloc.id, 'RETURNED')}
                              title="返却済にする"
                            >
                              返却
                            </button>
                          )}
                          <button
                            className="btn btn-outline-danger"
                            onClick={() => handleDelete(alloc.id)}
                            title="削除（引当解除）"
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination controls */}
        {!loading && allocations.length > 0 && (
          <div className="card-footer bg-white border-top-0 d-flex justify-content-between align-items-center px-4 py-3">
            <span className="text-muted small">合計 {pagination.count} 件</span>
            <div className="d-flex gap-2">
              <button
                className="btn btn-outline-primary btn-sm"
                disabled={!pagination.previous}
                onClick={() => {
                  setCurrentPageUrl(pagination.previous!);
                  fetchAllocations(pagination.previous!);
                }}
              >
                前へ
              </button>
              <button
                className="btn btn-outline-primary btn-sm"
                disabled={!pagination.next}
                onClick={() => {
                  setCurrentPageUrl(pagination.next!);
                  fetchAllocations(pagination.next!);
                }}
              >
                次へ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaterialAllocationPage;