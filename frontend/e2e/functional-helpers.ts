import { expect, request, type APIRequestContext, type Page } from '@playwright/test';

/**
 * 画面機能確認(goods-receipt*.spec.ts)で共通利用するヘルパー。
 * テスト仕様は docs/09_test_specifications/11_frontend_e2e_functional.md を参照。
 */

// script/e2e_goods_receipt_data.py が投入するE2E専用マスタ
export const E2E_ITEM_CODE = 'E2E-GR-ITEM';
export const E2E_WAREHOUSE = 'E2E-WH';
export const E2E_SUPPLIER = 'E2E-SUP';

export type Tokens = { access: string; refresh: string };

export type PurchaseOrder = {
  id: string;
  order_number: string;
  product_name: string;
  quantity: number;
  received_quantity: number;
  status: string;
  delivery_date: string | null;
  delivered_quantity: number | null;
};

export type DisplaySetting = {
  model_field_name: string;
  display_name?: string;
  display_order?: number;
  search_order?: number;
  is_list_display?: boolean;
  is_search_field?: boolean;
  is_list_filter?: boolean;
};

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} 環境変数が未設定です。` +
        'docs/09_test_specifications/11_frontend_e2e_functional.md の手順でテストユーザーを作成し、環境変数を設定してください。',
    );
  }
  return value;
}

export async function login(baseURL: string, userId: string, password: string): Promise<Tokens> {
  const api = await request.newContext({ baseURL });
  const response = await api.post('/api/users/token/', { data: { custom_id: userId, password } });
  expect(response.ok(), `${userId} でログインできること`).toBeTruthy();
  const tokens = (await response.json()) as Tokens;
  await api.dispose();
  return tokens;
}

export async function newApiContext(baseURL: string, tokens: Tokens): Promise<APIRequestContext> {
  return request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${tokens.access}` } });
}

/** ログイン画面を経由せず、取得済みのトークンでログイン済みの状態にする(page.goto より前に呼ぶ)。 */
export async function authenticate(page: Page, tokens: Tokens) {
  await page.addInitScript(([access, refresh]) => {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
  }, [tokens.access, tokens.refresh]);
}

export async function getDisplaySettings(api: APIRequestContext, dataType: string): Promise<DisplaySetting[]> {
  const response = await api.get(`/api/base/model-display-settings/?data_type=${dataType}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

/** 指定データ種別の表示設定を一括で置き換える(空配列を渡すと未設定の状態になる)。 */
export async function saveDisplaySettings(api: APIRequestContext, dataType: string, settings: DisplaySetting[]) {
  const data = settings.map(({ model_field_name, display_name, display_order, search_order, is_list_display, is_search_field, is_list_filter }) => ({
    model_field_name,
    display_name: display_name ?? '',
    display_order: display_order ?? 10,
    search_order: search_order ?? 10,
    is_list_display: is_list_display ?? true,
    is_search_field: is_search_field ?? false,
    is_list_filter: is_list_filter ?? false,
  }));
  const response = await api.post(`/api/base/model-display-settings/bulk-save/?data_type=${dataType}`, { data });
  expect(response.ok(), `${dataType} の表示設定を保存できること`).toBeTruthy();
}

export async function createPurchaseOrder(
  api: APIRequestContext,
  fields: { order_number: string; product_name: string; expected_arrival: string; quantity?: number },
): Promise<PurchaseOrder> {
  const response = await api.post('/api/inventory/purchase-orders/', {
    data: {
      item: 'E2E品目',
      quantity: 10,
      part_number: E2E_ITEM_CODE,
      supplier: E2E_SUPPLIER,
      warehouse: E2E_WAREHOUSE,
      location: 'E2E-LOC',
      ...fields,
    },
  });
  expect(
    response.ok(),
    `入庫予定 ${fields.order_number} を作成できること(E2E用マスタ未投入の場合は script/e2e_goods_receipt_data.py を実行)`,
  ).toBeTruthy();
  return response.json();
}

export async function getPurchaseOrder(api: APIRequestContext, id: string): Promise<PurchaseOrder> {
  const response = await api.get(`/api/inventory/purchase-orders/${id}/`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

/** 指定接頭辞の入庫予定のうち、入庫実績が無いもの(=削除可能なもの)を削除する。 */
export async function deleteUnreceivedPurchaseOrders(api: APIRequestContext, prefix: string) {
  const response = await api.get(
    `/api/inventory/purchase-orders/?search_order_number=${encodeURIComponent(prefix)}&page_size=1000`,
  );
  expect(response.ok()).toBeTruthy();
  const { results } = (await response.json()) as { results: PurchaseOrder[] };
  for (const order of results) {
    if (order.order_number.startsWith(prefix) && order.received_quantity === 0) {
      await api.delete(`/api/inventory/purchase-orders/${order.id}/`);
    }
  }
}

/** 実行ごとに一意な発注番号の一部(6桁)。発注番号は最大20文字のため短くしている。 */
export function newRunId(): string {
  return Date.now().toString(36).slice(-6).toUpperCase();
}
