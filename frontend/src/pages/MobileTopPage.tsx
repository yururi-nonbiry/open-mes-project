import { Link } from 'react-router-dom';
import './MobileTopPage.css';
import { t } from '../utils/terms';

const MobileTopPage = () => {
  return (
    <div className="mobile-top-page-container">
      <h1>現場業務メニュー</h1>
      <p>{t('入庫処理・順立て（ピッキング）・完成品の出庫・棚番移動を現場スマートフォンで行えます。')}</p>
      <div className="button-container">
        <Link to="/mobile/goods-receipt" className="action-button">入庫処理</Link>
        <Link to="/mobile/picking" className="action-button">{t('順立て・ピッキング')}</Link>
        <Link to="/mobile/goods-issue" className="action-button">{t('完成品の出庫')}</Link>
        <Link to="/mobile/location-transfer" className="action-button">棚番移動</Link>
      </div>
    </div>
  );
};

export default MobileTopPage;