import { useState, useEffect } from 'react';
import machineService, { Machine } from '../services/machineService';
import qualityService, { InspectionItem } from '../services/qualityService';
import InspectionResultModal from '../components/quality/InspectionResultModal';

const StartInspection = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [inspectionItems, setInspectionItems] = useState<InspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected state
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [activeModalItem, setActiveModalItem] = useState<InspectionItem | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [machinesList, itemsList] = await Promise.all([
          machineService.getMachines(),
          qualityService.getInspectionItems()
        ]);
        setMachines(machinesList);
        
        // Filter inspection items targeted to 'equipment'
        const equipmentItems = itemsList.filter(
          item => (item.target_object_type === 'equipment' || item.inspection_type === 'patrol') && item.is_active
        );
        setInspectionItems(equipmentItems);
      } catch (err: any) {
        setError(err.message || 'データの取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleInspectionSuccess = () => {
    alert('点検結果を正常に登録しました。');
    setActiveModalItem(null);
  };

  return (
    <div className="container mt-4 mb-5">
      <div className="mb-4">
        <h2 className="fw-bold text-dark">始業点検 (点検開始)</h2>
        <p className="text-muted">点検対象の設備を選択し、登録されている設備点検項目に従って点検結果を記録します。</p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">読み込み中...</span>
          </div>
          <p className="mt-2 text-muted">設備リストをロード中...</p>
        </div>
      ) : (
        <div className="row g-4">
          {/* Machines list (Left Panel) */}
          <div className="col-md-6">
            <div className="card border-0 shadow-sm rounded-3 h-100">
              <div className="card-header bg-white border-bottom-0 pt-4 px-4 pb-2">
                <h5 className="card-title fw-bold text-dark mb-0">
                  <i className="bi bi-cpu me-2 text-primary"></i>設備一覧
                </h5>
                <p className="small text-muted mb-0">点検を行う設備を選択してください。</p>
              </div>
              <div className="card-body p-4">
                {machines.length === 0 ? (
                  <p className="text-muted text-center py-4">登録されている設備がありません。</p>
                ) : (
                  <div className="list-group list-group-flush border-top border-bottom">
                    {machines.map((machine) => (
                      <button
                        key={machine.id}
                        type="button"
                        className={`list-group-item list-group-item-action border-0 py-3 px-3 rounded-2 my-1 d-flex justify-content-between align-items-center ${
                          selectedMachine?.id === machine.id ? 'bg-primary text-white' : ''
                        }`}
                        onClick={() => setSelectedMachine(machine)}
                      >
                        <div>
                          <div className="fw-bold">{machine.name}</div>
                          <small className={`${selectedMachine?.id === machine.id ? 'text-white-50' : 'text-muted'}`}>
                            設備番号: {machine.machine_number} | 設置場所: {machine.location || '未設定'}
                          </small>
                        </div>
                        {selectedMachine?.id === machine.id && (
                          <span className="badge bg-white text-primary rounded-pill px-3 py-2 small">選択中</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Inspection Items list (Right Panel) */}
          <div className="col-md-6">
            <div className="card border-0 shadow-sm rounded-3 h-100">
              <div className="card-header bg-white border-bottom-0 pt-4 px-4 pb-2">
                <h5 className="card-title fw-bold text-dark mb-0">
                  <i className="bi bi-clipboard-check me-2 text-primary"></i>点検項目一覧
                </h5>
                <p className="small text-muted mb-0">
                  {selectedMachine ? `「${selectedMachine.name}」で実行する点検項目を選んでください。` : '設備を選択すると、ここに点検項目が表示されます。'}
                </p>
              </div>
              <div className="card-body p-4">
                {!selectedMachine ? (
                  <div className="text-center py-5 text-muted">
                    <i className="bi bi-arrow-left-circle fs-2 d-block mb-2 text-primary"></i>
                    まず左側の設備一覧から対象設備を選択してください。
                  </div>
                ) : inspectionItems.length === 0 ? (
                  <p className="text-muted text-center py-4">対象となる設備点検項目が登録されていません。</p>
                ) : (
                  <div className="row g-3">
                    {inspectionItems.map((item) => (
                      <div key={item.id} className="col-12">
                        <div className="card border border-light-subtle h-100 shadow-sm hover-shadow-sm rounded-2">
                          <div className="card-body p-3 d-flex justify-content-between align-items-center">
                            <div>
                              <span className="badge bg-info text-dark mb-2 small">{item.inspection_type_display || item.inspection_type}</span>
                              <h6 className="fw-bold text-dark mb-1">{item.name}</h6>
                              <small className="text-muted">{item.description || '説明なし'}</small>
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm px-3 py-2 fw-semibold"
                              onClick={() => setActiveModalItem(item)}
                            >
                              点検開始
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal execution */}
      {selectedMachine && activeModalItem && (
        <InspectionResultModal
          item={activeModalItem}
          initialValues={{
            equipment_used: selectedMachine.machine_number
          }}
          onClose={() => setActiveModalItem(null)}
          onSuccess={handleInspectionSuccess}
        />
      )}
    </div>
  );
};

export default StartInspection;