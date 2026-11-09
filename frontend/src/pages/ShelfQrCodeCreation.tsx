import React, { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Form, Button } from 'react-bootstrap';

const ShelfQrCodeCreation = () => {
  const [warehouse, setWarehouse] = useState('');
  const [shelf, setShelf] = useState('');
  const [includeLabel, setIncludeLabel] = useState(false);

  const qrCodeValue = JSON.stringify({ warehouse, shelf });

  // QRコードの下に倉庫番号・棚番号の文字を描画したキャンバスを作成する
  const createLabeledCanvas = (qrCanvas: HTMLCanvasElement) => {
    const padding = 16;
    const fontSize = 20;
    const lineHeight = 28;
    const font = `bold ${fontSize}px sans-serif`;
    const lines = [`倉庫: ${warehouse}`, `棚番: ${shelf}`];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return qrCanvas;

    ctx.font = font;
    const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    canvas.width = Math.ceil(Math.max(qrCanvas.width, textWidth) + padding * 2);
    canvas.height = qrCanvas.height + padding * 2 + lineHeight * lines.length;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(qrCanvas, (canvas.width - qrCanvas.width) / 2, padding);

    ctx.font = font;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, qrCanvas.height + padding + 4 + lineHeight * i);
    });
    return canvas;
  };

  const handleDownload = () => {
    const qrCanvas = document.getElementById('qr-code-canvas') as HTMLCanvasElement | null;
    if (qrCanvas) {
      const canvas = includeLabel ? createLabeledCanvas(qrCanvas) : qrCanvas;
      const pngUrl = canvas
        .toDataURL('image/png')
        .replace('image/png', 'image/octet-stream');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `${warehouse || 'W'}-${shelf || 'S'}-qrcode.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  return (
    <div className="goods-receipt-page">
      <div className="goods-receipt-filter-panel">
        <div className="receipt-search-inputs-row">
          <div className="receipt-search-field">
            <label htmlFor="warehouse-input" className="receipt-search-label">倉庫番号</label>
            <Form.Control
              id="warehouse-input"
              size="sm"
              type="text"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
              placeholder="例: W01"
            />
          </div>
          <div className="receipt-search-field">
            <label htmlFor="shelf-input" className="receipt-search-label">棚番号</label>
            <Form.Control
              id="shelf-input"
              size="sm"
              type="text"
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
              placeholder="例: A-01-01"
            />
          </div>
          <div className="d-flex align-items-center pt-3">
            <Form.Check
              id="include-label-check"
              type="checkbox"
              label="画像下部に倉庫・棚番の文字を入れる"
              checked={includeLabel}
              onChange={(e) => setIncludeLabel(e.target.checked)}
              className="fw-semibold small text-secondary"
            />
          </div>
        </div>
      </div>

      <div className="goods-receipt-table-card p-4 text-center">
        {warehouse && shelf ? (
          <div>
            <div className="fw-bold text-dark mb-3">生成された棚番QRコード</div>
            <div className="d-inline-block p-3 border rounded bg-white shadow-sm">
              <QRCodeCanvas id="qr-code-canvas" value={qrCodeValue} size={220} />
              {includeLabel && (
                <div className="mt-2 fw-bold text-dark">
                  <div>倉庫: {warehouse}</div>
                  <div>棚番: {shelf}</div>
                </div>
              )}
            </div>
            <div className="mt-3 small text-secondary">
              QRデータ文字列: <code className="ms-1 px-2 py-1 bg-light border rounded text-dark">{qrCodeValue}</code>
            </div>
            <div className="mt-3">
              <Button variant="primary" className="fw-bold px-4" onClick={handleDownload}>
                PNG画像でダウンロード
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-4 text-muted">
            <div className="fw-bold mb-1">上の入力欄に「倉庫番号」と「棚番号」を入力してください</div>
            <div className="small">入力するとリアルタイムに棚番ラベル用のQRコードが生成されます。</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShelfQrCodeCreation;