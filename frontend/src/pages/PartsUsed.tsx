import React, { useState, useEffect, useCallback } from 'react';
import authFetch, { buildQueryString, handleError } from '../utils/api';
import { PaginationData } from '../types/production';

interface PartUsedRecord {
  id: string;
  production_plan: string;
  part_code: string;
  warehouse: string | null;
  quantity_used: number;
  used_datetime: string;
  remarks: string | null;
}

interface MasterItem {
  id: string;
  code: string;
  name: string;
  item_type: string;
}

interface MasterWarehouse {
  id: string;
  warehouse_number: string;
  name: string;
}

interface ProductionPlan {
  id: string;
  plan_name: string;
}

const PartsUsedPage = () => {
  // Lists for forms
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [items, setItems] = useState<MasterItem[]>([]);
  const [warehouses, setWarehouses] = useState<MasterWarehouse[]>([]);

  // Logs list
  const [logs, setLogs] = useState<PartUsedRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    count: 0,
    next: null as string | null,
    previous: null as string | null,
  });

  // Filter state
  const [planFilter, setPlanFilter] = useState('');
  const [partFilter, setPartFilter] = useState('');

  // Form state
  const [selectedPlan, setSelectedPlan] = useState('');
  const [selectedPart, setSelectedPart] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [usedDatetime, setUsedDatetime] = useState('');
  const [remarks, setRemarks] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load dropdown lists
  useEffect(() => {
    const loadMasters = async () => {
      try {
        const [plansRes, itemsRes, whsRes] = await Promise.all([
          authFetch('/api/production/plans/?page_size=100'),
          authFetch('/api/master/items/'),
          authFetch('/api/master/warehouses/')
        ]);

        if (plansRes.ok) {
          const data = await plansRes.json();
          // plans might be paginated or direct list depending on API
          setPlans(data.results || data.data || []);
        }

        if (itemsRes.ok) {
          const data = await itemsRes.json();
          const list = data.data || data;
          setItems(list.filter((item: MasterItem) => item.item_type === 'material'));
        }

        if (whsRes.ok) {
          const data = await whsRes.json();
          setWarehouses(data.data || data);
        }
      } catch (err) {
        console.error('Failed to load master lists:', err);
      }
    };

    loadMasters();

    // Set default datetime to local current time
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setUsedDatetime(now.toISOString().slice(0, 16));
  }, []);

  // Fetch usage logs
  const fetchLogs = useCallback(async (url: string) => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const response = await authFetch(url);
      await handleError(response, '部品使用実績の取得に失敗しました。');
      const data = await response.json() as PaginationData<PartUsedRecord>;
      
      setLogs(data.results || []);
      setPagination({
        count: data.count,
        next: data.next,
        previous: data.previous,
      });
    } catch (err: any) {
      setLogsError(err.message);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Build query params
    const params: Record<string, string> = {};
    if (planFilter) params.production_plan = planFilter;
    if (partFilter) params.part_code = partFilter;

    const query = buildQueryString(params);
    fetchLogs(`/api/production/parts-used/${query}`);
  }, [planFilter, partFilter, fetchLogs]);

  // Handle registration
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(false);

    if (!selectedPlan) {
      setFormError('生産計画を選択してください。');
      return;
    }
    if (!selectedPart) {
      setFormError('使用する部品を選択してください。');
      return;
    }
    if (!quantity || quantity <= 0) {
      setFormError('使用数量は1以上で入力してください。');
      return;
    }

    setFormSubmitting(true);
    try {
      const payload = {
        production_plan: selectedPlan,
        part_code: selectedPart,
        warehouse: selectedWarehouse || null,
        quantity_used: Number(quantity),
        used_datetime: usedDatetime ? new Date(usedDatetime).toISOString() : new Date().toISOString(),
        remarks: remarks || null
      };

      const response = await authFetch('/api/production/parts-used/', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      await handleError(response, '部品使用実績の登録に失敗しました。');
      
      setFormSuccess(true);
      // Reset form fields
      setSelectedPlan('');
      setSelectedPart('');
      setSelectedWarehouse('');
      setQuantity('');
      setRemarks('');
      
      // Refresh current page of logs
      fetchLogs('/api/production/parts-used/');
      
      // Clear success banner after 3 seconds
      setTimeout(() => setFormSuccess(false), 3000);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (!window.confirm('この使用実績レコードを削除しますか？')) {
      return;
    }
    try {
      const response = await authFetch(`/api/production/parts-used/${id}/`, {
        method: 'DELETE'
      });
      await handleError(response, '使用実績レコードの削除に失敗しました。');
      fetchLogs('/api/production/parts-used/');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="container mt-4 mb-5">
      <div className="mb-4">
        <h2 className="fw-bold text-dark">使用部品登録</h2>
        <p className="text-muted">生産工程で使用された部品および材料の数量と倉庫を記録・管理します。</p>
      </div>

      <div className="row g-4">
        {/* Registration Form (Left Column) */}
        <div className="col-lg-5">
          <div className="card border-0 shadow-sm rounded-3">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4 pb-2">
              <h5 className="card-title fw-bold text-dark mb-0">
                <i className="bi bi-plus-circle me-2 text-primary"></i>実績登録フォーム
              </h5>
            </div>
            <div className="card-body p-4">
              {formSuccess && (
                <div className="alert alert-success d-flex align-items-center" role="alert">
                  <i className="bi bi-check-circle-fill me-2"></i>
                  <div>使用部品実績を正常に登録しました。</div>
                </div>
              )}

              {formError && (
                <div className="alert alert-danger d-flex align-items-center" role="alert">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  <div>{formError}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="row g-3">
                <div className="col-12">
                  <label className="form-label fw-semibold text-secondary">対象生産計画</label>
                  <select
                    className="form-select border-secondary-subtle"
                    value={selectedPlan}
                    onChange={(e) => setSelectedPlan(e.target.value)}
                    required
                  >
                    <option value="">-- 計画を選択 --</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.plan_name}>
                        {p.plan_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label fw-semibold text-secondary">使用部品/材料</label>
                  <select
                    className="form-select border-secondary-subtle"
                    value={selectedPart}
                    onChange={(e) => setSelectedPart(e.target.value)}
                    required
                  >
                    <option value="">-- 部品を選択 --</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.code}>
                        [{item.code}] {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label fw-semibold text-secondary">払出倉庫 (任意)</label>
                  <select
                    className="form-select border-secondary-subtle"
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                  >
                    <option value="">-- 倉庫を選択 --</option>
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.warehouse_number}>
                        [{wh.warehouse_number}] {wh.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label fw-semibold text-secondary">使用数量</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control border-secondary-subtle"
                    placeholder="例: 10"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label fw-semibold text-secondary">使用日時</label>
                  <input
                    type="datetime-local"
                    className="form-control border-secondary-subtle"
                    value={usedDatetime}
                    onChange={(e) => setUsedDatetime(e.target.value)}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label fw-semibold text-secondary">備考</label>
                  <textarea
                    rows={2}
                    className="form-control border-secondary-subtle"
                    placeholder="特記事項があれば入力"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                </div>

                <div className="col-12 mt-4">
                  <button type="submit" className="btn btn-primary w-100 py-2" disabled={formSubmitting}>
                    {formSubmitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        登録中...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-save me-1"></i>実績を登録する
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* History Logs (Right Column) */}
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm rounded-3">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4 pb-2">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="card-title fw-bold text-dark mb-0">
                  <i className="bi bi-clock-history me-2 text-primary"></i>使用履歴
                </h5>
                <span className="badge bg-light text-secondary border">合計 {pagination.count} 件</span>
              </div>
            </div>
            <div className="card-body p-4">
              {/* Internal search filter */}
              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <input
                    type="text"
                    className="form-control form-control-sm border-secondary-subtle"
                    placeholder="計画名でフィルター"
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <input
                    type="text"
                    className="form-control form-control-sm border-secondary-subtle"
                    placeholder="部品コードでフィルター"
                    value={partFilter}
                    onChange={(e) => setPartFilter(e.target.value)}
                  />
                </div>
              </div>

              {logsError && <div className="alert alert-danger p-2">{logsError}</div>}

              {logsLoading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary spinner-border-sm" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-5 text-muted small">
                  部品使用実績が見つかりませんでした。
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle table-sm border-top">
                    <thead>
                      <tr>
                        <th>生産計画</th>
                        <th>部品コード</th>
                        <th>数量</th>
                        <th>倉庫</th>
                        <th>使用日時</th>
                        <th className="text-end">削除</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <div className="fw-semibold text-truncate" style={{ maxWidth: '120px' }} title={log.production_plan}>
                              {log.production_plan}
                            </div>
                          </td>
                          <td>
                            <span className="font-monospace text-secondary fw-semibold small">{log.part_code}</span>
                          </td>
                          <td className="fw-bold">{log.quantity_used}</td>
                          <td>
                            <span className="badge bg-light text-dark border">{log.warehouse || '-'}</span>
                          </td>
                          <td>
                            <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                              {new Date(log.used_datetime).toLocaleDateString()} {new Date(log.used_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </small>
                          </td>
                          <td className="text-end">
                            <button
                              className="btn btn-link text-danger p-0"
                              onClick={() => handleDeleteLog(log.id)}
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination for History */}
            {!logsLoading && logs.length > 0 && (
              <div className="card-footer bg-white border-top-0 d-flex justify-content-end align-items-center px-4 pb-4">
                <div className="btn-group btn-group-sm">
                  <button
                    className="btn btn-outline-primary"
                    disabled={!pagination.previous}
                    onClick={() => fetchLogs(pagination.previous!)}
                  >
                    前へ
                  </button>
                  <button
                    className="btn btn-outline-primary"
                    disabled={!pagination.next}
                    onClick={() => fetchLogs(pagination.next!)}
                  >
                    次へ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartsUsedPage;