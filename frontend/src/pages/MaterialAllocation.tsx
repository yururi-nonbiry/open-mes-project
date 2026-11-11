import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Spinner } from 'react-bootstrap';
import authFetch, { handleError } from '../utils/api';
import { MaterialAllocation, PaginationData } from '../types/production';
import { useWorkCenters } from '../hooks/useWorkCenters';
import { NavIcon } from '../config/navigationConfig';

const ALLOC_STATUS_TABS = [
  { value: '', label: 'すべて表示' },
  { value: 'ALLOCATED', label: '引当済（未ピッキング）' },
  { value: 'ISSUED', label: 'ピッキング済' },
  { value: 'RETURNED', label: '返却済' },
];

interface ProductGroup {
  key: string;
  planId: string;
  planName: string;
  productCode: string;
  productName: string;
  line: string;
  totalQuantity: number;
  items: MaterialAllocation[];
  allocatedCount: number;
  issuedCount: number;
  returnedCount: number;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
}

const MaterialAllocationPage: React.FC = () => {
  const [allocations, setAllocations] = useState<MaterialAllocation[]>([]);
  const [itemsMap, setItemsMap] = useState<Record<string, string>>({});
  const [plansMap, setPlansMap] = useState<Record<string, { productCode: string; productName: string; planName: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);

  // 選択中の完成品キー（'all' または 各ProductGroup.key）
  const [selectedProductKey, setSelectedProductKey] = useState<string>('');

  // 検索・フィルタ
  const [keywordFilter, setKeywordFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const workCenters = useWorkCenters();

  // 品番マスター・生産計画マスターを補助的に取得して名称を補完
  useEffect(() => {
    const fetchMasters = async () => {
      try {
        const itemRes = await authFetch('/api/master/items/?page_size=200');
        if (itemRes.ok) {
          const itemData = await itemRes.json();
          const map: Record<string, string> = {};
          (itemData.results || []).forEach((it: any) => {
            map[it.code] = it.name;
          });
          setItemsMap(map);
        }
      } catch (_e) {
        // オフライン・エラー時は無視
      }

      try {
        const planRes = await authFetch('/api/production/plans/?page_size=100');
        if (planRes.ok) {
          const planData = await planRes.json();
          const pMap: Record<string, { productCode: string; productName: string; planName: string }> = {};
          (planData.results || []).forEach((p: any) => {
            pMap[p.id] = {
              productCode: p.product_code || '',
              productName: p.product_name || p.product?.name || '',
              planName: p.plan_name || '',
            };
          });
          setPlansMap(pMap);
        }
      } catch (_e) {
        // オフライン・エラー時は無視
      }
    };

    fetchMasters();
  }, []);

  const fetchAllocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 順立て（ピッキング）では完成品ごとに紐づく全材料を表示するため、多めの件数を取得
      const response = await authFetch('/api/production/material-allocations/?page_size=300');
      await handleError(response, '順立て（ピッキング）データの取得に失敗しました。');
      const data = (await response.json()) as PaginationData<MaterialAllocation>;
      const results = data.results || [];
      setAllocations(results);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllocations();
  }, [fetchAllocations]);

  // 完成品（製品・生産計画）単位でグループ化
  const productGroups = useMemo(() => {
    const groupMap = new Map<string, ProductGroup>();

    allocations.forEach((alloc) => {
      const planId = alloc.production_plan || 'UNKNOWN';
      const planInfo = plansMap[planId];
      const planName = alloc.production_plan_name || planInfo?.planName || planId;
      const productCode = alloc.product_code || planInfo?.productCode || (planName.includes('PROD') ? planName.split(' ')[0] : 'PROD');
      const productName = alloc.product_name || planInfo?.productName || itemsMap[productCode] || (productCode ? `${productCode}（製品）` : '完成品');
      const line = alloc.line || '';

      const key = `${productCode}__${planId}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key,
          planId,
          planName,
          productCode,
          productName,
          line,
          totalQuantity: 0,
          items: [],
          allocatedCount: 0,
          issuedCount: 0,
          returnedCount: 0,
          status: 'PENDING',
        });
      }

      const group = groupMap.get(key)!;
      group.items.push(alloc);
      group.totalQuantity += Number(alloc.allocated_quantity || 0);

      if (alloc.status === 'ALLOCATED') group.allocatedCount += 1;
      else if (alloc.status === 'ISSUED') group.issuedCount += 1;
      else if (alloc.status === 'RETURNED') group.returnedCount += 1;
    });

    const groups = Array.from(groupMap.values()).map((g) => {
      let status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = 'PENDING';
      if (g.allocatedCount === 0 && g.issuedCount > 0) {
        status = 'COMPLETED';
      } else if (g.issuedCount > 0 || g.returnedCount > 0) {
        status = 'IN_PROGRESS';
      }
      return { ...g, status };
    });

    // 未ピッキングがあるグループを優先的に先頭に
    groups.sort((a, b) => {
      if (a.allocatedCount > 0 && b.allocatedCount === 0) return -1;
      if (a.allocatedCount === 0 && b.allocatedCount > 0) return 1;
      return a.planName.localeCompare(b.planName);
    });

    return groups;
  }, [allocations, plansMap, itemsMap]);

  // 初期ロード時、未選択なら最初の未ピッキング完成品を自動選択
  useEffect(() => {
    if (!selectedProductKey && productGroups.length > 0) {
      const firstPending = productGroups.find((g) => g.allocatedCount > 0) || productGroups[0];
      setSelectedProductKey(firstPending.key);
    }
  }, [productGroups, selectedProductKey]);

  // 完成品カードの絞り込み
  const filteredGroups = useMemo(() => {
    return productGroups.filter((g) => {
      if (keywordFilter) {
        const kw = keywordFilter.toLowerCase();
        const matches =
          g.productCode.toLowerCase().includes(kw) ||
          g.productName.toLowerCase().includes(kw) ||
          g.planName.toLowerCase().includes(kw) ||
          g.line.toLowerCase().includes(kw);
        if (!matches) return false;
      }
      if (lineFilter && lineFilter !== 'none' && g.line !== lineFilter) {
        return false;
      }
      if (lineFilter === 'none' && g.line) {
        return false;
      }
      return true;
    });
  }, [productGroups, keywordFilter, lineFilter]);

  // 現在選択されているグループ
  const currentGroup = useMemo(() => {
    if (selectedProductKey === 'all') return null;
    return productGroups.find((g) => g.key === selectedProductKey) || null;
  }, [productGroups, selectedProductKey]);

  // 表示対象の材料レコード
  const displayedAllocations = useMemo(() => {
    let list: MaterialAllocation[] = [];
    if (selectedProductKey === 'all' || !currentGroup) {
      list = allocations;
    } else {
      list = currentGroup.items;
    }

    return list.filter((alloc) => {
      if (statusFilter && alloc.status !== statusFilter) return false;
      if (materialFilter) {
        const mf = materialFilter.toLowerCase();
        const matName = alloc.material_name || itemsMap[alloc.material_code] || '';
        const matches = alloc.material_code.toLowerCase().includes(mf) || matName.toLowerCase().includes(mf);
        if (!matches) return false;
      }
      return true;
    });
  }, [selectedProductKey, currentGroup, allocations, statusFilter, materialFilter, itemsMap]);

  // ステータス更新（個別）
  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const label = newStatus === 'ISSUED' ? 'ピッキング済' : newStatus === 'RETURNED' ? '返却済' : '引当済';
    if (!window.confirm(`ステータスを「${label}」に変更しますか？`)) {
      return;
    }
    try {
      const response = await authFetch(`/api/production/material-allocations/${id}/change-status/`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus }),
      });
      await handleError(response, 'ステータスの更新に失敗しました。');
      fetchAllocations();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // 選択中完成品の未ピッキング材料を一括ピッキング
  const handleBatchPickAll = async () => {
    if (!currentGroup) return;
    const targetItems = currentGroup.items.filter((item) => item.status === 'ALLOCATED');
    if (targetItems.length === 0) {
      alert('未ピッキング（引当済）の材料はありません。');
      return;
    }

    if (
      !window.confirm(
        `【${currentGroup.productCode} ${currentGroup.productName}】の未ピッキング材料（${targetItems.length}件）を一括ピッキングしますか？`
      )
    ) {
      return;
    }

    setBatchLoading(true);
    let successCount = 0;
    try {
      for (const item of targetItems) {
        const response = await authFetch(`/api/production/material-allocations/${item.id}/change-status/`, {
          method: 'POST',
          body: JSON.stringify({ status: 'ISSUED' }),
        });
        if (response.ok) {
          successCount++;
        }
      }
      await fetchAllocations();
      alert(`${successCount} 件の材料をピッキング済みに更新しました！`);
    } catch (e: any) {
      alert(`一括ピッキング中にエラーが発生しました: ${e.message}`);
    } finally {
      setBatchLoading(false);
    }
  };

  // 出庫先ライン変更
  const handleLineChange = async (id: string, line: string) => {
    try {
      const response = await authFetch(`/api/production/material-allocations/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ line: line || null }),
      });
      await handleError(response, '出庫先ラインの変更に失敗しました。');
      fetchAllocations();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // 引当解除（削除）
  const handleDelete = async (id: string) => {
    if (!window.confirm('この引当を削除（引当解除）しますか？ 在庫の引当数が解除されます。')) {
      return;
    }
    try {
      const response = await authFetch(`/api/production/material-allocations/${id}/`, {
        method: 'DELETE',
      });
      await handleError(response, '引当の削除に失敗しました。');
      fetchAllocations();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const getStatusBadge = (status: string, display: string) => {
    switch (status) {
      case 'ALLOCATED':
        return <span className="receipt-status-badge status-pending">{display || '引当済'}</span>;
      case 'ISSUED':
        return <span className="receipt-status-badge status-completed">{display || 'ピッキング済'}</span>;
      case 'RETURNED':
        return <span className="receipt-status-badge status-canceled">{display || '返却済'}</span>;
      default:
        return <span className="receipt-status-badge">{display || status}</span>;
    }
  };

  return (
    <div className="goods-receipt-page material-allocation-page">
      {/* 画面説明・業務ステップバナー */}
      <div className="picking-flow-header mb-3">
        <div className="picking-flow-steps">
          <div className="picking-step-chip is-active">
            <span className="step-num">1</span>
            <span className="step-text">完成品（製品）を選択</span>
          </div>
          <span className="picking-step-arrow">→</span>
          <div className="picking-step-chip is-active">
            <span className="step-num">2</span>
            <span className="step-text">紐づく材料をピッキング</span>
          </div>
        </div>
        <p className="picking-flow-desc">
          ピッキングを行う対象の完成品を選ぶと、その完成品に必要な材料一覧が下に展開されます。確認して「ピッキング」を行ってください。
        </p>
      </div>

      {/* ステップ1：完成品選択エリア */}
      <div className="product-selector-card mb-4">
        <div className="product-selector-header">
          <div className="d-flex align-items-center gap-2">
            <span className="section-step-badge">ステップ 1</span>
            <h2 className="section-heading mb-0">ピッキング対象の完成品（製品）を選択</h2>
            <span className="badge bg-light text-dark border ms-2">全 {productGroups.length} 品目</span>
          </div>
          <div className="product-selector-search d-flex gap-2">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="完成品コード・品名・計画名で絞り込み..."
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
              style={{ width: '260px' }}
            />
            <select
              className="form-select form-select-sm"
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              style={{ width: '140px' }}
            >
              <option value="">ライン: すべて</option>
              <option value="none">未指定</option>
              {workCenters.map((w) => (
                <option key={w.code} value={w.code}>
                  {w.code}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" variant="primary" size="sm" className="me-2" />
            <span className="text-muted">完成品と引当データを読み込んでいます...</span>
          </div>
        ) : error ? (
          <div className="alert alert-danger my-3">{error}</div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-4 text-muted">
            条件に一致する完成品データがありません。生産計画画面で「材料引当」を実行してください。
          </div>
        ) : (
          <div className="product-cards-grid mt-3">
            {/* 全体表示カード */}
            <div
              className={`product-select-card all-items-card ${selectedProductKey === 'all' ? 'is-selected' : ''}`}
              onClick={() => setSelectedProductKey('all')}
              role="button"
              tabIndex={0}
            >
              <div className="product-card-top">
                <span className="product-card-icon">📂</span>
                <span className="product-card-code">全件表示</span>
                <span className="ms-auto badge bg-secondary-subtle text-secondary">横断確認</span>
              </div>
              <div className="product-card-name">すべての完成品の材料</div>
              <div className="product-card-plan">全体の引当・ピッキング状況を確認</div>
              <div className="product-card-footer">
                <span className="small text-muted">総材料: {allocations.length} 点</span>
              </div>
            </div>

            {/* 各完成品カード */}
            {filteredGroups.map((grp) => {
              const isSelected = selectedProductKey === grp.key;
              const hasPending = grp.allocatedCount > 0;
              const pickProgress = grp.items.length > 0 ? Math.round((grp.issuedCount / grp.items.length) * 100) : 0;

              return (
                <div
                  key={grp.key}
                  className={`product-select-card ${isSelected ? 'is-selected' : ''} ${hasPending ? 'has-pending' : 'is-completed'}`}
                  onClick={() => setSelectedProductKey(grp.key)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="product-card-top">
                    <span className="product-card-icon">📦</span>
                    <span className="product-card-code">{grp.productCode}</span>
                    {hasPending ? (
                      <span className="badge bg-warning text-dark ms-auto">
                        未済 {grp.allocatedCount}点
                      </span>
                    ) : (
                      <span className="badge bg-success ms-auto">
                        ✓ 完了
                      </span>
                    )}
                  </div>
                  <div className="product-card-name" title={grp.productName}>
                    {grp.productName}
                  </div>
                  <div className="product-card-plan text-truncate" title={grp.planName}>
                    計画: <span className="fw-medium text-dark">{grp.planName}</span>
                    {grp.line && <span className="ms-1 badge bg-light text-secondary border">{grp.line}</span>}
                  </div>

                  {/* 進捗プログレスバー */}
                  <div className="product-card-progress mt-2">
                    <div className="progress" style={{ height: '5px' }}>
                      <div
                        className={`progress-bar ${hasPending ? 'bg-primary' : 'bg-success'}`}
                        role="progressbar"
                        style={{ width: `${pickProgress}%` }}
                        aria-valuenow={pickProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      ></div>
                    </div>
                    <div className="d-flex justify-content-between small text-muted mt-1">
                      <span>ピッキング済: {grp.issuedCount}/{grp.items.length} 点</span>
                      <span>{pickProgress}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ステップ2：選択した完成品の材料ピッキングエリア */}
      <div className="goods-receipt-table-card material-picking-table-card">
        {/* 現在選択中の完成品ヘッダーバー */}
        <div className="current-product-banner">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div>
              <div className="d-flex align-items-center gap-2 mb-1">
                <span className="section-step-badge">ステップ 2</span>
                <h3 className="current-product-title mb-0">
                  {currentGroup ? (
                    <>
                      <span className="badge bg-primary me-2">{currentGroup.productCode}</span>
                      {currentGroup.productName}
                    </>
                  ) : (
                    'すべての完成品の材料（全件横断）'
                  )}
                </h3>
              </div>
              {currentGroup && (
                <div className="current-product-meta text-muted small">
                  対象計画: <strong>{currentGroup.planName}</strong>
                  {currentGroup.line && <span className="ms-2">出庫先ライン: <strong>{currentGroup.line}</strong></span>}
                  <span className="ms-3">
                    材料総点数: <strong>{currentGroup.items.length}</strong> 点（未ピッキング: <strong className="text-danger">{currentGroup.allocatedCount}</strong> 点）
                  </span>
                </div>
              )}
            </div>

            <div className="d-flex align-items-center gap-2">
              {currentGroup && currentGroup.allocatedCount > 0 && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm fw-bold px-3 shadow-sm d-flex align-items-center gap-1"
                  onClick={handleBatchPickAll}
                  disabled={batchLoading}
                >
                  {batchLoading ? (
                    <>
                      <Spinner animation="border" size="sm" />
                      <span>処理中...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡ 未ピッキング材料を一括ピッキング</span>
                      <span className="badge bg-white text-primary ms-1">{currentGroup.allocatedCount}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* フィルタパネル */}
        <div className="goods-receipt-filter-panel border-top pt-3">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div className="receipt-status-tabs" role="tablist">
              {ALLOC_STATUS_TABS.map((tab) => (
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

            <div className="d-flex align-items-center gap-2 ms-auto">
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="材料コード・材料名で検索..."
                value={materialFilter}
                onChange={(e) => setMaterialFilter(e.target.value)}
                style={{ width: '220px' }}
              />
              <span className="receipt-result-count">
                対象：<strong>{displayedAllocations.length}</strong> 件
              </span>
            </div>
          </div>
        </div>

        {/* テーブル */}
        <div className="table-responsive mb-0">
          <table className="table table-hover align-middle goods-receipt-table mb-0">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>材料コード・材料名</th>
                {selectedProductKey === 'all' && <th>完成品（計画）</th>}
                <th style={{ width: '14%' }}>出庫先ライン</th>
                <th style={{ width: '12%' }}>保管倉庫</th>
                <th className="text-end" style={{ width: '10%' }}>引当数量</th>
                <th style={{ width: '13%' }}>引当日時</th>
                <th style={{ width: '12%' }}>状態</th>
                <th>備考</th>
                <th className="text-center" style={{ width: '140px' }}>ピッキング操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={selectedProductKey === 'all' ? 9 : 8} className="text-center py-5">
                    <Spinner animation="border" variant="primary" size="sm" className="me-2" />
                    <span className="text-muted">材料データを読み込んでいます...</span>
                  </td>
                </tr>
              ) : displayedAllocations.length === 0 ? (
                <tr>
                  <td colSpan={selectedProductKey === 'all' ? 9 : 8} className="text-center py-5 text-muted">
                    {currentGroup
                      ? 'この完成品に該当する材料データがありません。'
                      : '条件に一致する材料データがありません。'}
                  </td>
                </tr>
              ) : (
                displayedAllocations.map((alloc) => {
                  const matName = alloc.material_name || itemsMap[alloc.material_code] || '—';
                  const isAllocated = alloc.status === 'ALLOCATED';
                  const isIssued = alloc.status === 'ISSUED';

                  return (
                    <tr key={alloc.id} className={isAllocated ? 'table-warning-subtle' : ''}>
                      <td>
                        <div className="fw-bold text-dark font-monospace">{alloc.material_code}</div>
                        <div className="small text-secondary text-truncate" title={matName}>
                          {matName}
                        </div>
                      </td>

                      {selectedProductKey === 'all' && (
                        <td>
                          <div className="fw-semibold text-dark">
                            {alloc.product_code ? `[${alloc.product_code}] ` : ''}
                            {alloc.production_plan_name || '—'}
                          </div>
                          <small className="text-muted font-monospace">{alloc.production_plan}</small>
                        </td>
                      )}

                      <td>
                        {isAllocated ? (
                          <select
                            className="form-select form-select-sm"
                            value={alloc.line || ''}
                            onChange={(e) => handleLineChange(alloc.id, e.target.value)}
                          >
                            <option value="">未指定</option>
                            {workCenters.map((w) => (
                              <option key={w.code} value={w.code}>
                                {w.code}{w.name ? `（${w.name}）` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          alloc.line || <span className="text-muted">未指定</span>
                        )}
                      </td>

                      <td>
                        <span className="badge bg-light text-dark border">
                          {alloc.warehouse || '標準倉庫'}
                        </span>
                      </td>

                      <td className="text-end">
                        <span className="receipt-remaining-qty has-remaining fw-bold">
                          {alloc.allocated_quantity}
                        </span>
                      </td>

                      <td className="small text-muted">
                        {alloc.allocation_datetime
                          ? new Date(alloc.allocation_datetime).toLocaleString('ja-JP', {
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
                            {alloc.allocation_type_display || '追加ピッキング'}
                          </span>
                        )}
                      </td>

                      <td className="small text-muted">{alloc.remarks || '—'}</td>

                      <td className="text-center text-nowrap">
                        {isAllocated && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary fw-bold px-3 me-1"
                            onClick={() => handleUpdateStatus(alloc.id, 'ISSUED')}
                          >
                            ピッキング
                          </button>
                        )}
                        {isIssued && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary fw-bold me-1"
                            onClick={() => handleUpdateStatus(alloc.id, 'RETURNED')}
                          >
                            返却
                          </button>
                        )}
                        {isAllocated && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger fw-bold"
                            onClick={() => handleDelete(alloc.id)}
                            title="引当解除"
                          >
                            解除
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MaterialAllocationPage;
