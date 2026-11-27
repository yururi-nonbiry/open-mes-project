import { Fragment, useState, useEffect, lazy, Suspense } from 'react';
import terminologyService from './services/terminologyService';
import { onTermsChange, setTerms } from './utils/terms';
import type { ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation, Outlet } from 'react-router-dom';
import './App.css';
import Header from './components/Header';
import SideMenu from './components/SideMenu';
import PageContextBanner from './components/PageContextBanner';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import VersionModal from './components/VersionModal';
import MobileLayout from './layouts/MobileLayout';
import MobileLoginPage from './pages/mobile/MobileLoginPage';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';

// ルートごとに遅延読み込みし、初期バンドルサイズを抑える
const TopPage = lazy(() => import('./pages/TopPage'));
const InventoryInquiry = lazy(() => import('./pages/InventoryInquiry'));
const StockMovementHistory = lazy(() => import('./pages/StockMovementHistory'));
const ShipmentSchedule = lazy(() => import('./pages/ShipmentSchedule'));
const GoodsReceipt = lazy(() => import('./pages/GoodsReceipt'));
const GoodsIssue = lazy(() => import('./pages/GoodsIssue'));
const ProductionPlan = lazy(() => import('./pages/ProductionPlan'));
const MaterialAllocation = lazy(() => import('./pages/MaterialAllocation'));
const PartsSupplySimulationPage = lazy(() => import('./pages/production/PartsSupplySimulationPage'));
const WorkProgress = lazy(() => import('./pages/WorkProgress'));
// 受入検査・工程内検査は同じ画面(検査の種類だけが違う)
const InspectionPage = lazy(() => import('./pages/quality/InspectionPage'));
const QualityMasterCreation = lazy(() => import('./pages/QualityMasterCreation'));
const StartInspection = lazy(() => import('./pages/StartInspection'));
const InspectionHistory = lazy(() => import('./pages/InspectionHistory'));
const MachineMasterCreation = lazy(() => import('./pages/MachineMasterCreation'));
const BomMasterCreation = lazy(() => import('./pages/BomMasterCreation'));
const DataImport = lazy(() => import('./pages/DataImport'));
const UserSettings = lazy(() => import('./pages/UserSettings'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const UserForm = lazy(() => import('./pages/UserForm'));
const SystemSettings = lazy(() => import('./pages/SystemSettings'));
const SecurityPage = lazy(() => import('./pages/SecurityPage'));
const CsvMappingSettings = lazy(() => import('./pages/CsvMappingSettings'));
const ModelDisplaySettings = lazy(() => import('./pages/ModelDisplaySettings'));
const PageDisplaySettings = lazy(() => import('./pages/PageDisplaySettings'));
const QrCodeActionSettings = lazy(() => import('./pages/QrCodeActionSettings'));
const ShelfQrCodeCreation = lazy(() => import('./pages/ShelfQrCodeCreation'));
const WarehouseLayoutCreation = lazy(() => import('./pages/WarehouseLayoutCreation'));
const StockPurposeMaster = lazy(() => import('./pages/StockPurposeMaster'));
const WorkCalendarMaster = lazy(() => import('./pages/WorkCalendarMaster'));
const OrderDeletion = lazy(() => import('./pages/OrderDeletion'));
const FeatureSettings = lazy(() => import('./pages/FeatureSettings'));
const UsagePage = lazy(() => import('./pages/UsagePage'));
const MobileTopPage = lazy(() => import('./pages/MobileTopPage'));
const MobileGoodsReceiptPage = lazy(() => import('./pages/mobile/MobileGoodsReceiptPage'));
const MobileGoodsIssuePage = lazy(() => import('./pages/mobile/MobileGoodsIssuePage'));
const MobilePickingPage = lazy(() => import('./pages/mobile/MobilePickingPage'));
const MobileLocationTransferPage = lazy(() => import('./pages/mobile/MobileLocationTransferPage'));

// モバイル専用リダイレクト処理
const MobileRedirector = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isPasswordExpired } = useAuth();

  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const path = location.pathname;
    const isMobilePath = path.startsWith('/mobile');
    const isLoginPath = path === '/login';
    // パスワードの有効期限切れ時は、端末によらずパスワード変更のある設定画面(/user/settings)へ誘導する。
    // ここでモバイルトップへ戻すと、期限切れの誘導と交互にリダイレクトし続けて操作できなくなる
    const isPasswordSettingsPath = isAuthenticated && isPasswordExpired && path === '/user/settings';

    if (isMobile) {
      // モバイル端末かつデスクトップ用ログインならモバイルログインへ
      if (isLoginPath) {
        navigate('/mobile/login', { replace: true, state: location.state }); // ログイン後に戻る元の画面(state.from)を引き継ぐ
        return;
      }
      // モバイル端末かつモバイル以外のページならモバイルトップへ
      if (!isMobilePath && !isPasswordSettingsPath) {
        navigate('/mobile', { replace: true });
        return;
      }
    }

    if (!isMobile && isMobilePath) {
      // デスクトップ端末かつモバイルページならPCトップへ
      navigate('/', { replace: true });
      return;
    }
  }, [location.pathname, location.state, navigate, isAuthenticated, isPasswordExpired]);

  return null;
};

// コンポーネント内で定義すると描画のたびに別のコンポーネントになり、配下の画面が作り直されて入力が消えるため、外で定義する
const StaffRoute = ({ children }: { children: ReactNode }) => {
  const { isStaff } = useAuth();
  if (!isStaff) {
    // スタッフでない場合はトップページにリダイレクト
    return <Navigate to="/" replace />;
  }
  return children;
};

function AppContent() {
  const { isAuthenticated, isStaff, isPasswordExpired, loading, logout, checkAuth } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);

  const toggleMenu = () => setMenuOpen(prev => !prev);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    document.body.classList.toggle('menu-open-no-scroll', menuOpen);
    return () => { document.body.classList.remove('menu-open-no-scroll'); };
  }, [menuOpen]);

  // 管理者が設定した用語(部品・ピッキング・出庫)の呼び方。変わったら画面を描き直して反映する
  const [termsVersion, setTermsVersion] = useState(0);
  // ログイン後、最初の用語の取得が終わるまで画面を表示しない。表示してから用語が変わると、
  // 画面全体を作り直すことになり、各画面のデータ取得が二重に走るため
  const [termsLoaded, setTermsLoaded] = useState(false);
  useEffect(() => onTermsChange(() => setTermsVersion(v => v + 1)), []);
  useEffect(() => {
    if (!isAuthenticated) return;
    terminologyService.get()
      .then((terms) => { setTerms(terms); })
      .catch(() => { /* 取得できなければ既定の呼び方で表示する */ })
      .finally(() => setTermsLoaded(true));
  }, [isAuthenticated]);

  if (loading || (isAuthenticated && !termsLoaded)) return <div className="p-4">読み込み中...</div>;

  // パスワードの有効期限が切れている間は、パスワード変更のある設定画面以外を開かせない
  if (isAuthenticated && isPasswordExpired && location.pathname !== '/user/settings') {
    return <Navigate to="/user/settings" replace />;
  }

  return (
    <Fragment key={termsVersion}>
      <MobileRedirector />

      <Suspense fallback={<div className="p-4">読み込み中...</div>}>
      <Routes>
        {/* Public Login Routes */}
        <Route
          path="/login"
          element={<LoginPage onLoginSuccess={checkAuth} isAuthenticated={isAuthenticated} />}
        />
        <Route
          path="/mobile/login"
          element={<MobileLoginPage onLoginSuccess={checkAuth} isAuthenticated={isAuthenticated} />}
        />

        {/* Desktop Protected Routes with Layout */}
        <Route
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <>
                <Header
                  onMenuClick={toggleMenu}
                  isMenuOpen={menuOpen}
                  isAuthenticated={isAuthenticated}
                  isStaffOrSuperuser={isStaff}
                />
                <SideMenu
                  isOpen={menuOpen}
                  isStaffOrSuperuser={isStaff}
                  onVersionClick={() => setVersionModalOpen(true)}
                  onLinkClick={closeMenu}
                  onLogout={logout}
                  isAuthenticated={isAuthenticated}
                />
                {menuOpen && <div id="menu-overlay" onClick={closeMenu} />}
                <main className='main-contents container'>
                  <PageContextBanner />
                  <Outlet />
                </main>
              </>
            </ProtectedRoute>
          }
        >
          {/* Desktop Protected Routes */}
          <Route path="/" element={<TopPage isStaffOrSuperuser={isStaff} isAuthenticated={isAuthenticated} onLogout={logout} />} />
          <Route path="/inventory/inquiry" element={<InventoryInquiry />} />
          <Route path="/inventory/stock-movement-history" element={<StockMovementHistory />} />
          <Route path="/inventory/shipment" element={<ShipmentSchedule />} />
          <Route path="/inventory/purchase" element={<GoodsReceipt />} />
          <Route path="/inventory/issue" element={<GoodsIssue />} />
          <Route path="/production/plan" element={<ProductionPlan />} />
          <Route path="/production/bom-master" element={<BomMasterCreation />} />
          <Route path="/production/material-allocation" element={<MaterialAllocation />} />
          <Route path="/production/parts-supply-simulation" element={<PartsSupplySimulationPage />} />
          <Route path="/production/work-progress" element={<WorkProgress />} />
          <Route path="/quality/process-inspection" element={<InspectionPage inspectionType="in_process" />} />
          <Route path="/quality/acceptance-inspection" element={<InspectionPage inspectionType="acceptance" />} />
          <Route path="/quality/master-creation" element={<QualityMasterCreation />} />
          <Route path="/machine/start-inspection" element={<StartInspection />} />
          <Route path="/machine/inspection-history" element={<InspectionHistory />} />
          <Route path="/machine/master-creation" element={<MachineMasterCreation />} />
          <Route path="/data/import" element={<DataImport />} />
          <Route path="/user/settings" element={<UserSettings />} />
          <Route path="/usage" element={<UsagePage />} />
          <Route path="/user/management" element={<StaffRoute><UserManagement /></StaffRoute>} />
          <Route path="/user/management/create" element={<StaffRoute><UserForm /></StaffRoute>} />
          <Route path="/user/management/edit/:id" element={<StaffRoute><UserForm /></StaffRoute>} />
          <Route path="/system/settings" element={<StaffRoute><SystemSettings /></StaffRoute>} />
          <Route path="/system/security" element={<StaffRoute><SecurityPage /></StaffRoute>} />
          <Route path="/system/csv-mappings" element={<StaffRoute><CsvMappingSettings /></StaffRoute>} />
          <Route path="/system/model-display-settings" element={<StaffRoute><ModelDisplaySettings /></StaffRoute>} />
          <Route path="/system/page-display-settings" element={<StaffRoute><PageDisplaySettings /></StaffRoute>} />
          <Route path="/system/qr-code-actions" element={<StaffRoute><QrCodeActionSettings /></StaffRoute>} />
          <Route path="/system/shelf-qr-code" element={<StaffRoute><ShelfQrCodeCreation /></StaffRoute>} />
          <Route path="/master/warehouse-layout" element={<StaffRoute><WarehouseLayoutCreation /></StaffRoute>} />
          <Route path="/master/stock-purposes" element={<StaffRoute><StockPurposeMaster /></StaffRoute>} />
          <Route path="/master/work-calendar" element={<StaffRoute><WorkCalendarMaster /></StaffRoute>} />
          <Route path="/system/order-deletion" element={<StaffRoute><OrderDeletion /></StaffRoute>} />
          <Route path="/system/feature-settings" element={<StaffRoute><FeatureSettings /></StaffRoute>} />
        </Route>

        {/* Mobile Protected Routes */}
        <Route element={<ProtectedRoute isAuthenticated={isAuthenticated}><MobileLayout onLogout={logout} /></ProtectedRoute>}>
          <Route path="/mobile" element={<MobileTopPage />} />
          <Route path="/mobile/goods-receipt" element={<MobileGoodsReceiptPage />} />
          <Route path="/mobile/picking" element={<MobilePickingPage />} />
          <Route path="/mobile/goods-issue" element={<MobileGoodsIssuePage />} />
          <Route path="/mobile/location-transfer" element={<MobileLocationTransferPage />} />
        </Route>
      </Routes>
      </Suspense>

      <VersionModal isOpen={versionModalOpen} onClose={() => setVersionModalOpen(false)} />
    </Fragment>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}
