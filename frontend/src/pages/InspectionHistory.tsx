import { useState, useEffect, useCallback } from 'react';
import authFetch, { handleError } from '../utils/api';

interface ResultDetail {
  measurement_detail: string;
  measured_value_numeric: number | null;
  result_qualitative: string | null;
}

interface InspectionResult {
  id: string;
  inspection_item: string;
  inspected_at: string;
  inspected_by: number | null;
  inspected_by_username: string | null;
  part_number: string | null;
  lot_number: string | null;
  serial_number: string | null;
  related_order_type: string | null;
  related_order_number: string | null;
  quantity_inspected: number | null;
  judgment: string;
  judgment_display: string;
  remarks: string | null;
  attachment: string | null;
  equipment_used: string | null;
  details: ResultDetail[];
}

interface InspectionItemSummary {
  id: string;
  code: string;
  name: string;
  inspection_type_display: string;
}

interface MeasurementDetailDef {
  id: string;
  name: string;
  measurement_type: 'quantitative' | 'qualitative';
  specification_nominal?: number | null;
  specification_upper_limit?: number | null;
  specification_lower_limit?: number | null;
  specification_unit?: string;
  expected_qualitative_result?: string;
}

const InspectionHistory = () => {
  const [results, setResults] = useState<InspectionResult[]>([]);
  const [itemsLookup, setItemsLookup] = useState<Record<string, InspectionItemSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [lotFilter, setLotFilter] = useState('');
  const [partFilter, setPartFilter] = useState('');
  const [judgmentFilter, setJudgmentFilter] = useState('');

  // Extended detail maps for expanded rows
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [itemDetailsDef, setItemDetailsDef] = useState<Record<string, Record<string, MeasurementDetailDef>>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  // Load results and inspection items
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resultsRes, itemsRes] = await Promise.all([
        authFetch('/api/quality/inspection-results/'),
        authFetch('/api/quality/inspection-items/')
      ]);

      await handleError(resultsRes, '検査実績の取得に失敗しました。');
      await handleError(itemsRes, '検査項目マスターの取得に失敗しました。');

      const resultsData = await resultsRes.json();
      const itemsData = await itemsRes.json();

      setResults(resultsData.data || resultsData || []);

      // Build items lookup map
      const lookup: Record<string, InspectionItemSummary> = {};
      const itemsList = itemsData.data || itemsData || [];
      itemsList.forEach((item: any) => {
        lookup[item.id] = {
          id: item.id,
          code: item.code,
          name: item.name,
          inspection_type_display: item.inspection_type_display || item.inspection_type
        };
      });
      setItemsLookup(lookup);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load detailed measurement specifications on demand
  const handleToggleRow = async (resultId: string, itemId: string) => {
    if (expandedRow === resultId) {
      setExpandedRow(null);
      return;
    }

    setExpandedRow(resultId);

    // If already loaded definition, skip API call
    if (itemDetailsDef[itemId]) return;

    setDetailLoading(true);
    try {
      const response = await authFetch(`/api/quality/inspection-items/${itemId}/`);
      await handleError(response, '検査項目詳細の取得に失敗しました。');
      const data = await response.json();
      const itemData = data.data || data;
      const detailsList = itemData.measurement_details || [];

      // Convert details to map { detailId: detailDef }
      const detailDefMap: Record<string, MeasurementDetailDef> = {};
      detailsList.forEach((d: MeasurementDetailDef) => {
        if (d.id) detailDefMap[d.id] = d;
      });

      setItemDetailsDef(prev => ({
        ...prev,
        [itemId]: detailDefMap
      }));
    } catch (err) {
      console.error('Failed to load inspection detail spec:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const getJudgmentBadge = (judgment: string, display: string) => {
    switch (judgment) {
      case 'pass':
        return <span className="badge bg-success"><i className="bi bi-check-circle-fill me-1"></i>{display}</span>;
      case 'fail':
        return <span className="badge bg-danger"><i className="bi bi-x-circle-fill me-1"></i>{display}</span>;
      case 'conditional_pass':
        return <span className="badge bg-warning text-dark"><i className="bi bi-exclamation-triangle-fill me-1"></i>{display}</span>;
      case 'pending':
      default:
        return <span className="badge bg-secondary"><i className="bi bi-hourglass-split me-1"></i>{display}</span>;
    }
  };

  // Local client-side filters
  const filteredResults = results.filter((r) => {
    if (lotFilter && !r.lot_number?.toLowerCase().includes(lotFilter.toLowerCase())) return false;
    if (partFilter && !r.part_number?.toLowerCase().includes(partFilter.toLowerCase())) return false;
    if (judgmentFilter && r.judgment !== judgmentFilter) return false;
    return true;
  });

  // Analytics counts
  const totalCount = filteredResults.length;
  const passCount = filteredResults.filter(r => r.judgment === 'pass').length;
  const failCount = filteredResults.filter(r => r.judgment === 'fail').length;

  return (
    <div className="container mt-4 mb-5">
      <div className="mb-4">
        <h2 className="fw-bold text-dark">点検・検査履歴</h2>
        <p className="text-muted">受入、工程内、最終製品、および設備始業点検の実績履歴を一覧表示します。</p>
      </div>

      {/* Summary Stats Row */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm rounded-3 bg-white p-3 d-flex flex-row align-items-center">
            <div className="rounded-circle bg-primary-subtle p-3 text-primary me-3">
              <i className="bi bi-list-task fs-4"></i>
            </div>
            <div>
              <small className="text-muted d-block">合計測定件数</small>
              <span className="fs-3 fw-bold">{totalCount} <small className="fs-6 fw-normal text-muted">件</small></span>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm rounded-3 bg-white p-3 d-flex flex-row align-items-center">
            <div className="rounded-circle bg-success-subtle p-3 text-success me-3">
              <i className="bi bi-shield-check fs-4"></i>
            </div>
            <div>
              <small className="text-muted d-block">合格数</small>
              <span className="fs-3 fw-bold text-success">{passCount} <small className="fs-6 fw-normal text-muted">件</small></span>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm rounded-3 bg-white p-3 d-flex flex-row align-items-center">
            <div className="rounded-circle bg-danger-subtle p-3 text-danger me-3">
              <i className="bi bi-shield-slash fs-4"></i>
            </div>
            <div>
              <small className="text-muted d-block">不合格数</small>
              <span className="fs-3 fw-bold text-danger">{failCount} <small className="fs-6 fw-normal text-muted">件</small></span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter panel */}
      <div className="card border-0 shadow-sm rounded-3 mb-4">
        <div className="card-body p-4">
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label fw-semibold text-secondary">品番/品名</label>
              <input
                type="text"
                className="form-control border-secondary-subtle"
                placeholder="品番で絞り込み"
                value={partFilter}
                onChange={(e) => setPartFilter(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold text-secondary">ロット番号</label>
              <input
                type="text"
                className="form-control border-secondary-subtle"
                placeholder="ロット番号で絞り込み"
                value={lotFilter}
                onChange={(e) => setLotFilter(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold text-secondary">判定結果</label>
              <select
                className="form-select border-secondary-subtle"
                value={judgmentFilter}
                onChange={(e) => setJudgmentFilter(e.target.value)}
              >
                <option value="">全判定</option>
                <option value="pass">合格</option>
                <option value="fail">不合格</option>
                <option value="conditional_pass">条件付き合格</option>
                <option value="pending">保留</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="card border-0 shadow-sm rounded-3">
        <div className="card-body p-0">
          {error && <div className="alert alert-danger m-3">{error}</div>}

          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-2 text-muted">履歴データを取得しています...</p>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="text-center py-5 text-muted">
              点検・検査実績が見つかりませんでした。
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="ps-4 border-0">検査日時</th>
                    <th className="border-0">検査項目</th>
                    <th className="border-0">対象/ロット</th>
                    <th className="border-0">使用設備</th>
                    <th className="border-0">判定</th>
                    <th className="border-0">検査員</th>
                    <th className="pe-4 border-0 text-end">詳細</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((result) => {
                    const item = itemsLookup[result.inspection_item];
                    const isExpanded = expandedRow === result.id;
                    return (
                      <React.Fragment key={result.id}>
                        <tr style={{ cursor: 'pointer' }} onClick={() => handleToggleRow(result.id, result.inspection_item)}>
                          <td className="ps-4">
                            <div>{new Date(result.inspected_at).toLocaleDateString()}</div>
                            <small className="text-muted">
                              {new Date(result.inspected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </small>
                          </td>
                          <td>
                            <span className="badge bg-light text-secondary border mb-1 d-block w-fit-content">
                              {item?.inspection_type_display || '不明'}
                            </span>
                            <div className="fw-semibold text-dark">{item?.name || '不明な項目'}</div>
                            <small className="text-muted font-monospace">{item?.code || result.inspection_item.slice(0, 8)}</small>
                          </td>
                          <td>
                            {result.part_number && (
                              <div>
                                <small className="text-secondary fw-semibold">品番: </small>
                                <span className="font-monospace text-dark fw-bold small">{result.part_number}</span>
                              </div>
                            )}
                            {result.lot_number && (
                              <div>
                                <small className="text-secondary fw-semibold">Lot: </small>
                                <span className="font-monospace text-secondary small">{result.lot_number}</span>
                              </div>
                            )}
                            {!result.part_number && !result.lot_number && <span className="text-muted">-</span>}
                          </td>
                          <td>{result.equipment_used || '-'}</td>
                          <td>{getJudgmentBadge(result.judgment, result.judgment_display)}</td>
                          <td>{result.inspected_by_username || '-'}</td>
                          <td className="pe-4 text-end">
                            <button className="btn btn-link text-primary p-0">
                              <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'} fs-5`}></i>
                            </button>
                          </td>
                        </tr>

                        {/* Expanded details row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="bg-light-subtle px-4 py-3">
                              <div className="card border-0 shadow-sm p-3 bg-white">
                                <h6 className="fw-bold mb-3 border-bottom pb-2">
                                  <i className="bi bi-list-check me-2 text-primary"></i>測定値・判定結果内訳
                                </h6>
                                
                                {detailLoading ? (
                                  <div className="text-center py-3">
                                    <div className="spinner-border spinner-border-sm text-primary" role="status" />
                                  </div>
                                ) : result.details.length === 0 ? (
                                  <p className="text-muted small mb-0">測定詳細データが登録されていません。</p>
                                ) : (
                                  <div className="row g-3">
                                    {result.details.map((detail, index) => {
                                      const def = itemDetailsDef[result.inspection_item]?.[detail.measurement_detail];
                                      return (
                                        <div key={index} className="col-md-6">
                                          <div className="p-3 border rounded bg-light-subtle">
                                            <div className="d-flex justify-content-between mb-1">
                                              <span className="fw-bold text-dark">{def?.name || '不明な測定点'}</span>
                                              <span className="badge bg-secondary-subtle text-secondary small">
                                                {def?.measurement_type === 'quantitative' ? '定量' : '定性'}
                                              </span>
                                            </div>

                                            {/* Measurement values */}
                                            <div className="fs-5 fw-bold text-primary my-2">
                                              {def?.measurement_type === 'quantitative' ? (
                                                <>
                                                  {detail.measured_value_numeric !== null ? detail.measured_value_numeric : '-'}
                                                  <span className="fs-6 fw-normal text-muted ms-1">{def?.specification_unit || ''}</span>
                                                </>
                                              ) : (
                                                detail.result_qualitative || '-'
                                              )}
                                            </div>

                                            {/* Specifications definition */}
                                            <small className="text-muted d-block">
                                              {def?.measurement_type === 'quantitative' ? (
                                                <>
                                                  基準規格: 
                                                  {def.specification_nominal !== undefined && ` 中心 ${def.specification_nominal}`}
                                                  {def.specification_lower_limit !== undefined && ` [下限 ${def.specification_lower_limit}`}
                                                  {def.specification_upper_limit !== undefined && ` 〜 上限 ${def.specification_upper_limit}]`}
                                                </>
                                              ) : (
                                                <>期待値: {def?.expected_qualitative_result || '特になし'}</>
                                              )}
                                            </small>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {result.remarks && (
                                  <div className="mt-3 p-3 bg-light rounded text-dark small">
                                    <strong>備考:</strong> {result.remarks}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InspectionHistory;