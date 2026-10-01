import React, { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Card, Form, Container, Row, Col, Button } from 'react-bootstrap';

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
    <Container className="mt-4">
      <Row className="justify-content-md-center">
        <Col md={6}>
          <Card>
            <Card.Body>
              <Card.Title as="h2" className="text-center mb-4">倉庫棚番QR作成</Card.Title>
              <Form>
                <Form.Group as={Row} className="mb-3" controlId="warehouse-input">
                  <Form.Label column sm={3}>
                    倉庫番号
                  </Form.Label>
                  <Col sm={9}>
                    <Form.Control
                      type="text"
                      value={warehouse}
                      onChange={(e) => setWarehouse(e.target.value)}
                      placeholder="倉庫番号を入力"
                    />
                  </Col>
                </Form.Group>

                <Form.Group as={Row} className="mb-3" controlId="shelf-input">
                  <Form.Label column sm={3}>
                    棚番号
                  </Form.Label>
                  <Col sm={9}>
                    <Form.Control
                      type="text"
                      value={shelf}
                      onChange={(e) => setShelf(e.target.value)}
                      placeholder="棚番号を入力"
                    />
                  </Col>
                </Form.Group>

                <Form.Group className="mb-3" controlId="include-label-check">
                  <Form.Check
                    type="checkbox"
                    label="倉庫・棚番を文字で書き出す"
                    checked={includeLabel}
                    onChange={(e) => setIncludeLabel(e.target.checked)}
                  />
                </Form.Group>
              </Form>

              {warehouse && shelf && (
                <div className="text-center mt-4">
                  <h4>生成されたQRコード</h4>
                  <div className="d-inline-block p-3 border rounded">
                    <QRCodeCanvas id="qr-code-canvas" value={qrCodeValue} size={256} />
                    {includeLabel && (
                      <div className="mt-2 fw-bold">
                        <div>倉庫: {warehouse}</div>
                        <div>棚番: {shelf}</div>
                      </div>
                    )}
                  </div>
                  <p className="mt-3">QRコードの文字列:</p>
                  <code>{qrCodeValue}</code>
                  <div className="mt-3">
                    <Button variant="primary" onClick={handleDownload}>
                      PNGでダウンロード
                    </Button>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ShelfQrCodeCreation;