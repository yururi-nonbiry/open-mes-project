import { Link } from 'react-router-dom';
import './MobileTopPage.css';

const MobileTopPage = () => {
  return (
    <div className="mobile-top-page-container">
      <h1>現場業務メニュー</h1>
      <p>入庫処理・順立て（ピッキング）・棚番移動を現場スマートフォンで行えます。</p>
      <div className="button-container">
        <Link to="/mobile/goods-receipt" className="action-button">入庫処理</Link>
        <Link to="/mobile/goods-issue" className="action-button">順立て・ピッキング（出庫）</Link>
        <Link to="/mobile/location-transfer" className="action-button">棚番移動</Link>
      </div>
    </div>
  );
};

export default MobileTopPage;