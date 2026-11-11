import type { ApiErrorLike } from './apiErrorTypes';
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
      } catch (err) {
        setError((err as ApiErrorLike).message || 'データの取得に失敗しました。');
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
    <div className="goods-receipt-page">
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
            <div className="goods-receipt-table-card h-100">
              <div className="p-3 border-bottom bg-light">
                <h6 className="fw-bold text-dark mb-1">① 対象設備の選択</h6>
                <p className="small text-secondary mb-0">点検を行う設備を選択してください。</p>
              </div>
              <div className="p-3">
                {machines.length === 0 ? (
                  <p className="text-muted text-center py-4">登録されている設備がありません。</p>
                ) : (
                  <div>
                    {machines.map((machine) => {
                      const isSelected = selectedMachine?.id === machine.id;
                      return (
                        <button
                          key={machine.id}
                          type="button"
                          className={`machine-select-item d-flex justify-content-between align-items-center ${
                            isSelected ? 'active' : ''
                          }`}
                          onClick={() => setSelectedMachine(machine)}
                        >
                          <div>
                            <div className="fw-bold">{machine.name}</div>
                            <small className="machine-meta-text">
                              設備番号: {machine.machine_number} | 設置場所: {machine.location || '未設定'}
                            </small>
                          </div>
                          {isSelected && (
                            <span className="status-mono-badge is-active">選択中</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Inspection Items list (Right Panel) */}
          <div className="col-md-6">
            <div className="goods-receipt-table-card h-100">
              <div className="p-3 border-bottom bg-light">
                <h6 className="fw-bold text-dark mb-1">② 点検項目の選択・記録</h6>
                <p className="small text-secondary mb-0">
                  {selectedMachine ? `「${selectedMachine.name}」で実行する点検項目を選んでください。` : '設備を選択すると、ここに点検項目が表示されます。'}
                </p>
              </div>
              <div className="p-3">
                {!selectedMachine ? (
                  <div className="text-center py-5 text-muted">
                    まず左側の設備一覧から対象設備を選択してください。
                  </div>
                ) : inspectionItems.length === 0 ? (
                  <p className="text-muted text-center py-4">対象となる設備点検項目が登録されていません。</p>
                ) : (
                  <div className="row g-3">
                    {inspectionItems.map((item) => (
                      <div key={item.id} className="col-12">
                        <div className="p-3 border rounded-3 bg-white d-flex justify-content-between align-items-center">
                          <div>
                            <span className="receipt-status-badge status-in-progress mb-2">{item.inspection_type_display || item.inspection_type}</span>
                            <h6 className="fw-bold text-dark mb-1">{item.name}</h6>
                            <small className="text-secondary">{item.description || '説明なし'}</small>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm px-3 py-2 fw-bold shadow-sm"
                            onClick={() => setActiveModalItem(item)}
                          >
                            点検開始
                          </button>
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