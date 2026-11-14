import { BarcodeDetector as WasmBarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

// wasm は既定だと外部 CDN(jsDelivr)から取得されるため、アプリに同梱したファイルを読み込む。
// fireImmediately を指定しないので、実際に使われるまで読み込みは行われない。
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? zxingReaderWasmUrl : prefix + path,
  },
});

/** ZXing-C++(WebAssembly)による BarcodeDetector 互換の実装 */
export { WasmBarcodeDetector };
