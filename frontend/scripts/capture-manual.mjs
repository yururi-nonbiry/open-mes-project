// 「使い方」ページ用の画面キャプチャを撮影し、public/manual/ に保存します。
//
// 使い方:
//   npx playwright install chromium   (初回のみ)
//   npm run capture:manual            (開発サーバー http://localhost:5173 を撮影)
//   MANUAL_BASE_URL=http://localhost:5175 npm run capture:manual
//
// API (/api/...) へのリクエストはすべて下記のサンプルデータで応答するため、
// 実データは写らず、データベースも変更されません。起動が必要なのはフロントエンドだけです。
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE_URL = (process.env.MANUAL_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const OUT_DIR = fileURLToPath(new URL('../public/manual/', import.meta.url));

// ---- サンプルデータ (すべて架空) ----------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysFromToday = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return ymd(d);
};
const isoFromToday = (offset, hour = 9, minute = 0) =>
  `${daysFromToday(offset)}T${pad(hour)}:${pad(minute)}:00+09:00`;

const SESSION_INFO = {
  isAuthenticated: true,
  isStaff: true,
  isSuperuser: true,
};

const USER_SETTINGS = {
  custom_id: 'admin_demo',
  username: '佐藤 健一',
  email: 'sato@example.com',
};

const USERS = [
  {
    id: 'u-1',
    custom_id: 'admin_demo',
    username: '佐藤 健一',
    email: 'sato@example.com',
    account_type: 'human',
    is_staff: true,
    is_superuser: true,
    is_active: true,
    date_joined: '2025-04-01T09:00:00+09:00',
  },
  {
    id: 'u-2',
    custom_id: 'suzuki_01',
    username: '鈴木 花子',
    email: 'suzuki@example.com',
    account_type: 'human',
    is_staff: true,
    is_superuser: false,
    is_active: true,
    date_joined: '2025-05-12T09:00:00+09:00',
  },
  {
    id: 'u-3',
    custom_id: 'akita_sync',
    username: '秋田工業MES連携',
    email: 'sync@example.com',
    account_type: 'system',
    is_staff: true,
    is_superuser: false,
    is_active: true,
    date_joined: '2025-06-01T09:00:00+09:00',
  },
  {
    id: 'u-4',
    custom_id: 'takahashi_02',
    username: '高橋 誠',
    email: 'takahashi@example.com',
    account_type: 'human',
    is_staff: false,
    is_superuser: false,
    is_active: true,
    date_joined: '2025-09-10T09:00:00+09:00',
  },
];

const USER_TOKEN_DETAIL = {
  api_token: 'omes_live_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c',
  policy: {
    is_active: true,
    allowed_ips: '192.168.10.0/24\n10.0.0.15',
    scopes: ['inventory', 'master', 'production'],
  },
};

const MASTER_ITEMS = [
  {
    id: 'itm-1',
    code: '71010-AK100-00',
    name: 'フロントブラケットASSY',
    item_type: 'Product',
    item_type_display: '製品',
    unit: '個',
    default_warehouse: '第1倉庫',
    default_location: 'A-01-01',
    provision_type: 'paid',
    lead_time_days: 3,
    description: 'AK-100向けフロントブラケット完成品',
    is_active: true,
  },
  {
    id: 'itm-2',
    code: '71020-AK100',
    name: 'ブラケットサブASSY',
    item_type: 'Intermediate',
    item_type_display: '中間品',
    unit: '個',
    default_warehouse: '第1倉庫',
    default_location: 'A-02-01',
    provision_type: 'none',
    lead_time_days: 2,
    description: '社内溶接サブアッシー',
    is_active: true,
  },
  {
    id: 'itm-3',
    code: '71031-AK100',
    name: 'ブラケット本体プレス品',
    item_type: 'Material',
    item_type_display: '材料',
    unit: '個',
    default_warehouse: '第1倉庫',
    default_location: 'B-01-01',
    provision_type: 'free',
    lead_time_days: 5,
    description: '板厚3.2mm プレス成形品',
    is_active: true,
  },
  {
    id: 'itm-4',
    code: '71032-AK100',
    name: '補強プレート',
    item_type: 'Material',
    item_type_display: '材料',
    unit: '枚',
    default_warehouse: '第1倉庫',
    default_location: 'B-01-02',
    provision_type: 'paid',
    lead_time_days: 4,
    description: '溶接用ガセットプレート',
    is_active: true,
  },
  {
    id: 'itm-5',
    code: '90105-00010',
    name: '六角フランジボルト M8×25',
    item_type: 'Material',
    item_type_display: '材料',
    unit: '本',
    default_warehouse: '第2倉庫',
    default_location: 'C-01-01',
    provision_type: 'paid',
    lead_time_days: 7,
    description: '高強度ボルト',
    is_active: true,
  },
];

const SUPPLIERS = [
  { id: 'sup-1', supplier_number: 'V1001', name: 'サンプル精工(株)', contact_person: '山田 太郎', phone: '03-0000-1111', email: 'yamada@sample.co.jp', is_active: true },
  { id: 'sup-2', supplier_number: 'V1002', name: '見本金属工業(株)', contact_person: '井上 次郎', phone: '052-000-2222', email: 'inoue@mihon.co.jp', is_active: true },
];

const WAREHOUSES = [
  { id: 'wh-1', warehouse_number: '第1倉庫', name: '本社第1倉庫（組立・部材）', location: '本社工場 北棟1F', layout_cols: 12, layout_rows: 8, is_active: true },
  { id: 'wh-2', warehouse_number: '第2倉庫', name: '第2倉庫（資材・ファスナー）', location: '本社工場 南棟1F', layout_cols: 10, layout_rows: 6, is_active: true },
];

const WAREHOUSE_LOCATIONS = [
  { id: 'loc-1', warehouse: '第1倉庫', code: 'A-01-01', name: '完成品棚 A-1', pos_x: 1, pos_y: 1, width: 3, height: 2 },
  { id: 'loc-2', warehouse: '第1倉庫', code: 'A-01-02', name: '完成品棚 A-2', pos_x: 5, pos_y: 1, width: 3, height: 2 },
  { id: 'loc-3', warehouse: '第1倉庫', code: 'A-02-01', name: '中間品棚 A-3', pos_x: 9, pos_y: 1, width: 2, height: 2 },
  { id: 'loc-4', warehouse: '第1倉庫', code: 'B-01-01', name: 'プレス部品棚 B-1', pos_x: 1, pos_y: 4, width: 3, height: 2 },
  { id: 'loc-5', warehouse: '第1倉庫', code: 'B-01-02', name: 'プレート棚 B-2', pos_x: 5, pos_y: 4, width: 3, height: 2 },
];

const INVENTORIES = [
  {
    id: 'inv-1',
    part_number: '71010-AK100-00',
    part_name: 'フロントブラケットASSY',
    warehouse: '第1倉庫',
    location: 'A-01-01',
    quantity: 45,
    reserved: 15,
    available_quantity: 30,
    last_updated: isoFromToday(0, 9, 15),
    is_active: true,
    is_allocatable: true,
  },
  {
    id: 'inv-2',
    part_number: '71020-AK100',
    part_name: 'ブラケットサブASSY',
    warehouse: '第1倉庫',
    location: 'A-02-01',
    quantity: 30,
    reserved: 10,
    available_quantity: 20,
    last_updated: isoFromToday(0, 8, 40),
    is_active: true,
    is_allocatable: true,
  },
  {
    id: 'inv-3',
    part_number: '71031-AK100',
    part_name: 'ブラケット本体プレス品',
    warehouse: '第1倉庫',
    location: 'B-01-01',
    quantity: 120,
    reserved: 40,
    available_quantity: 80,
    last_updated: isoFromToday(-1, 16, 20),
    is_active: true,
    is_allocatable: true,
  },
  {
    id: 'inv-4',
    code: '71032-AK100',
    part_number: '71032-AK100',
    part_name: '補強プレート',
    warehouse: '第1倉庫',
    location: 'B-01-02',
    quantity: 85,
    reserved: 20,
    available_quantity: 65,
    last_updated: isoFromToday(-1, 14, 10),
    is_active: true,
    is_allocatable: true,
  },
  {
    id: 'inv-5',
    part_number: '90105-00010',
    part_name: '六角フランジボルト M8×25',
    warehouse: '第2倉庫',
    location: 'C-01-01',
    quantity: 500,
    reserved: 80,
    available_quantity: 420,
    last_updated: isoFromToday(-2, 11, 0),
    is_active: true,
    is_allocatable: true,
  },
];

const STOCK_MOVEMENTS = [
  {
    id: 'mv-1',
    movement_date: isoFromToday(0, 10, 20),
    part_number: '71010-AK100-00',
    warehouse: '第1倉庫',
    movement_type: 'PRODUCTION_OUTPUT',
    movement_type_display: '生産完了入庫',
    quantity: 20,
    operator_username: '佐藤 健一',
    description: '計画 AK100-10月第4週 完了入庫',
    reference_document: 'PLAN-2401',
  },
  {
    id: 'mv-2',
    movement_date: isoFromToday(0, 9, 45),
    part_number: '71031-AK100',
    warehouse: '第1倉庫',
    movement_type: 'used',
    movement_type_display: '生産使用',
    quantity: 20,
    operator_username: '鈴木 花子',
    description: '材料引当出庫 (PLAN-2402)',
    reference_document: 'ALLOC-108',
  },
  {
    id: 'mv-3',
    movement_date: isoFromToday(0, 9, 10),
    part_number: '71032-AK100',
    warehouse: '第1倉庫',
    movement_type: 'incoming',
    movement_type_display: '入庫',
    quantity: 50,
    operator_username: '高橋 誠',
    description: 'Location: B-01-02',
    reference_document: 'PO-2026-081',
  },
  {
    id: 'mv-4',
    movement_date: isoFromToday(-1, 16, 30),
    part_number: '71010-AK100-00',
    warehouse: '第1倉庫',
    movement_type: 'outgoing',
    movement_type_display: '出庫',
    quantity: 12,
    operator_username: '高橋 誠',
    description: '受注 N056007 出荷',
    reference_document: 'N056007-1',
  },
  {
    id: 'mv-5',
    movement_date: isoFromToday(-1, 13, 15),
    part_number: '90105-00010',
    warehouse: '第2倉庫',
    movement_type: 'adjustment',
    movement_type_display: '在庫調整',
    quantity: 500,
    operator_username: '佐藤 健一',
    description: '定期棚卸による在庫数確認 (Location: C-01-01)',
    reference_document: 'INV-ADJ',
  },
];

const SALES_ORDERS = [
  {
    id: 'so-1',
    order_number: 'N056014-1',
    item: '71010-AK100-00',
    quantity: 24,
    shipped_quantity: 0,
    reserved_quantity: 24,
    remaining_quantity: 24,
    order_date: daysFromToday(-5),
    expected_shipment: daysFromToday(0),
    shipment_number: '1便',
    warehouse: '第1倉庫',
    status: 'pending',
    status_display: '未出庫',
    is_internal: false,
  },
  {
    id: 'so-2',
    order_number: 'N056021-1',
    item: '71010-AK100-00',
    quantity: 30,
    shipped_quantity: 10,
    reserved_quantity: 20,
    remaining_quantity: 20,
    order_date: daysFromToday(-4),
    expected_shipment: daysFromToday(1),
    shipment_number: '2便',
    warehouse: '第1倉庫',
    status: 'pending',
    status_display: '未出庫',
    is_internal: false,
  },
  {
    id: 'so-3',
    order_number: 'N056028-2',
    item: '72200-BX310-00',
    quantity: 16,
    shipped_quantity: 0,
    reserved_quantity: 16,
    remaining_quantity: 16,
    order_date: daysFromToday(-3),
    expected_shipment: daysFromToday(2),
    shipment_number: '1便',
    warehouse: '第1倉庫',
    status: 'pending',
    status_display: '未出庫',
    is_internal: false,
  },
];

const PURCHASE_ORDERS = [
  {
    id: 'po-1',
    order_number: 'PO-2026-085',
    supplier: 'V1001',
    supplier_name: 'サンプル精工(株)',
    item: '71031-AK100',
    product_name: 'ブラケット本体プレス品',
    quantity: 60,
    received_quantity: 0,
    expected_arrival: isoFromToday(0, 10, 0),
    warehouse: '第1倉庫',
    location: 'B-01-01',
    status: 'pending',
    status_display: '未入庫',
    delivery_date: daysFromToday(0),
    delivered_quantity: 60,
  },
  {
    id: 'po-2',
    order_number: 'PO-2026-086',
    supplier: 'V1002',
    supplier_name: '見本金属工業(株)',
    item: '71032-AK100',
    product_name: '補強プレート',
    quantity: 100,
    received_quantity: 40,
    expected_arrival: isoFromToday(1, 13, 0),
    warehouse: '第1倉庫',
    location: 'B-01-02',
    status: 'partially_received',
    status_display: '一部入庫',
    delivery_date: null,
    delivered_quantity: null,
  },
  {
    id: 'po-3',
    order_number: 'PO-2026-089',
    supplier: 'V1002',
    supplier_name: '見本金属工業(株)',
    item: '90105-00010',
    product_name: '六角フランジボルト M8×25',
    quantity: 200,
    received_quantity: 0,
    expected_arrival: isoFromToday(2, 9, 0),
    warehouse: '第2倉庫',
    location: 'C-01-01',
    status: 'pending',
    status_display: '未入庫',
    delivery_date: null,
    delivered_quantity: null,
  },
];

const PRODUCTION_PLANS = [
  {
    id: 'plan-1',
    plan_name: 'AK100 フロントブラケット 第1ロット',
    product_code: '71010-AK100-00',
    planned_quantity: 20,
    planned_start_datetime: isoFromToday(1, 8, 30),
    planned_end_datetime: isoFromToday(2, 17, 0),
    actual_start_datetime: null,
    actual_end_datetime: null,
    status: 'PENDING',
    status_display: '未着手',
    parent_plan: null,
    parent_plan_name: null,
    child_plan_count: 1,
    pending_intermediate_count: 1,
    remarks: 'N056014-1 向け出荷分',
  },
  {
    id: 'plan-2',
    plan_name: '[中間品] 71020-AK100 (AK100 フロントブラケット 第1ロット)',
    product_code: '71020-AK100',
    planned_quantity: 20,
    planned_start_datetime: isoFromToday(0, 8, 30),
    planned_end_datetime: isoFromToday(0, 17, 0),
    actual_start_datetime: isoFromToday(0, 8, 35),
    actual_end_datetime: null,
    status: 'IN_PROGRESS',
    status_display: '進行中',
    parent_plan: 'plan-1',
    parent_plan_name: 'AK100 フロントブラケット 第1ロット',
    child_plan_count: 0,
    pending_intermediate_count: 0,
    remarks: '親計画の開始前にサブ組付を完了する',
  },
  {
    id: 'plan-3',
    plan_name: 'AK100 フロントブラケット 第2ロット',
    product_code: '71010-AK100-00',
    planned_quantity: 30,
    planned_start_datetime: isoFromToday(3, 8, 30),
    planned_end_datetime: isoFromToday(4, 17, 0),
    actual_start_datetime: null,
    actual_end_datetime: null,
    status: 'PENDING',
    status_display: '未着手',
    parent_plan: null,
    parent_plan_name: null,
    child_plan_count: 0,
    pending_intermediate_count: 0,
    remarks: 'N056021-1 向け',
  },
];

const INTERMEDIATE_REQUIREMENTS = [
  {
    material_code: '71020-AK100',
    material_name: 'ブラケットサブASSY',
    unit: '個',
    required_quantity: 20,
    allocated_quantity: 0,
    child_planned_quantity: 0,
    projected_available_quantity: 20,
    uncovered_quantity: 20,
    shortage_quantity: 0,
    supply_method: '',
    supply_method_display: '未決定',
    status: 'DECISION_REQUIRED',
    child_plans: [],
  },
  {
    material_code: '71040-AK100',
    material_name: 'ステーサブASSY',
    unit: '個',
    required_quantity: 20,
    allocated_quantity: 0,
    child_planned_quantity: 20,
    projected_available_quantity: 5,
    uncovered_quantity: 0,
    shortage_quantity: 0,
    supply_method: 'CHILD_PLAN',
    supply_method_display: '子計画で生産',
    status: 'COVERED',
    child_plans: [
      {
        id: 'plan-2',
        plan_name: '[中間品] 71040-AK100',
        planned_quantity: 20,
        planned_start_datetime: isoFromToday(0, 8, 30),
        planned_end_datetime: isoFromToday(0, 17, 0),
        status: 'IN_PROGRESS',
        status_display: '進行中',
      },
    ],
  },
];

const REQUIRED_PARTS = [
  {
    part_code: '71020-AK100',
    part_name: 'ブラケットサブASSY',
    unit: '個',
    quantity_per_unit: '1.000',
    required_quantity: 20,
    already_allocated_quantity: 0,
    additional_issued_quantity: 0,
    inventory_quantity: 20,
    warehouses: [{ warehouse: '第1倉庫', available_quantity: 20 }],
  },
  {
    part_code: '90105-00010',
    part_name: '六角フランジボルト M8×25',
    unit: '本',
    quantity_per_unit: '4.000',
    required_quantity: 80,
    already_allocated_quantity: 40,
    additional_issued_quantity: 0,
    inventory_quantity: 420,
    warehouses: [{ warehouse: '第2倉庫', available_quantity: 420 }],
  },
];

const BOM_ITEMS = [
  {
    id: 'bom-1',
    product: '71010-AK100-00',
    product_name: 'フロントブラケットASSY',
    material: '71020-AK100',
    material_name: 'ブラケットサブASSY',
    material_unit: '個',
    quantity: '1.000',
    remarks: '社内溶接サブアッシー',
  },
  {
    id: 'bom-2',
    product: '71010-AK100-00',
    product_name: 'フロントブラケットASSY',
    material: '90105-00010',
    material_name: '六角フランジボルト M8×25',
    material_unit: '本',
    quantity: '4.000',
    remarks: '最終組付用',
  },
  {
    id: 'bom-3',
    product: '71020-AK100',
    product_name: 'ブラケットサブASSY',
    material: '71031-AK100',
    material_name: 'ブラケット本体プレス品',
    material_unit: '個',
    quantity: '1.000',
    remarks: 'メインフレーム',
  },
  {
    id: 'bom-4',
    product: '71020-AK100',
    product_name: 'ブラケットサブASSY',
    material: '71032-AK100',
    material_name: '補強プレート',
    material_unit: '枚',
    quantity: '2.000',
    remarks: '左右各1枚',
  },
];

const BOM_EXPLOSION = {
  item_code: '71010-AK100-00',
  item_name: 'フロントブラケットASSY',
  quantity: '1',
  tree: [
    {
      item_code: '71020-AK100',
      item_name: 'ブラケットサブASSY',
      item_type: 'Intermediate',
      unit: '個',
      level: 1,
      quantity_per_parent: '1.000',
      required_quantity: '1.000',
      children: [
        {
          item_code: '71031-AK100',
          item_name: 'ブラケット本体プレス品',
          item_type: 'Material',
          unit: '個',
          level: 2,
          quantity_per_parent: '1.000',
          required_quantity: '1.000',
          children: [],
        },
        {
          item_code: '71032-AK100',
          item_name: '補強プレート',
          item_type: 'Material',
          unit: '枚',
          level: 2,
          quantity_per_parent: '2.000',
          required_quantity: '2.000',
          children: [],
        },
      ],
    },
    {
      item_code: '90105-00010',
      item_name: '六角フランジボルト M8×25',
      item_type: 'Material',
      unit: '本',
      level: 1,
      quantity_per_parent: '4.000',
      required_quantity: '4.000',
      children: [],
    },
  ],
  totals: [
    { item_code: '71031-AK100', item_name: 'ブラケット本体プレス品', unit: '個', required_quantity: '1.000' },
    { item_code: '71032-AK100', item_name: '補強プレート', unit: '枚', required_quantity: '2.000' },
    { item_code: '90105-00010', item_name: '六角フランジボルト M8×25', unit: '本', required_quantity: '4.000' },
  ],
};

const MATERIAL_ALLOCATIONS = [
  {
    id: 'alloc-1',
    production_plan: 'plan-1',
    production_plan_name: 'AK100 フロントブラケット 第1ロット',
    material_code: '90105-00010',
    allocated_quantity: 40,
    allocation_datetime: isoFromToday(0, 8, 50),
    status: 'ALLOCATED',
    status_display: '引当済',
    allocation_type: 'NORMAL',
    allocation_type_display: '通常引当',
    remarks: '第2倉庫より引当',
    warehouse: '第2倉庫',
  },
  {
    id: 'alloc-2',
    production_plan: 'plan-2',
    production_plan_name: '[中間品] 71020-AK100',
    material_code: '71031-AK100',
    allocated_quantity: 20,
    allocation_datetime: isoFromToday(0, 8, 15),
    status: 'ISSUED',
    status_display: '出庫済',
    allocation_type: 'NORMAL',
    allocation_type_display: '通常引当',
    remarks: '溶接ラインへ出庫済',
    warehouse: '第1倉庫',
  },
  {
    id: 'alloc-3',
    production_plan: 'plan-2',
    production_plan_name: '[中間品] 71020-AK100',
    material_code: '71032-AK100',
    allocated_quantity: 2,
    allocation_datetime: isoFromToday(0, 10, 5),
    status: 'ISSUED',
    status_display: '出庫済',
    allocation_type: 'ADDITIONAL',
    allocation_type_display: '追加出庫',
    remarks: '溶接スパッタ付着による交換分',
    warehouse: '第1倉庫',
  },
];

const SIMULATION_RESULT = {
  plans: [
    {
      plan_id: 'plan-2',
      plan_name: '[中間品] 71020-AK100 (AK100 フロントブラケット 第1ロット)',
      product_code: '71020-AK100',
      planned_start_datetime: isoFromToday(0, 8, 30),
      planned_quantity: 20,
      status: 'IN_PROGRESS',
      feasible: true,
      limiting_parts: [],
    },
    {
      plan_id: 'plan-1',
      plan_name: 'AK100 フロントブラケット 第1ロット',
      product_code: '71010-AK100-00',
      planned_start_datetime: isoFromToday(1, 8, 30),
      planned_quantity: 20,
      status: 'PENDING',
      feasible: true,
      limiting_parts: [],
    },
    {
      plan_id: 'plan-3',
      plan_name: 'AK100 フロントブラケット 第2ロット',
      product_code: '71010-AK100-00',
      planned_start_datetime: isoFromToday(3, 8, 30),
      planned_quantity: 30,
      status: 'PENDING',
      feasible: false,
      limiting_parts: [
        { part_code: '71032-AK100', part_name: '補強プレート', warehouse: '第1倉庫', shortage_quantity: 15 },
      ],
    },
  ],
  parts: [
    {
      part_code: '71032-AK100',
      part_name: '補強プレート',
      warehouse: '第1倉庫',
      available_quantity: 65,
      incoming_quantity: 0,
      incoming_plans: [],
      total_required_quantity: 80,
      shortage_quantity: 15,
      shortage_plan_id: 'plan-3',
      shortage_plan_name: 'AK100 フロントブラケット 第2ロット',
      shortage_date: isoFromToday(3, 8, 30),
      lead_time_days: 4,
      order_by_date: daysFromToday(-1),
      order_overdue: true,
    },
    {
      part_code: '71020-AK100',
      part_name: 'ブラケットサブASSY',
      warehouse: '第1倉庫',
      available_quantity: 20,
      incoming_quantity: 20,
      incoming_plans: [
        {
          plan_id: 'plan-2',
          plan_name: '[中間品] 71020-AK100',
          quantity: 20,
          planned_end_datetime: isoFromToday(0, 17, 0),
          at_risk: false,
        },
      ],
      total_required_quantity: 40,
      shortage_quantity: 0,
      shortage_plan_id: null,
      shortage_plan_name: null,
      shortage_date: null,
      lead_time_days: 2,
      order_by_date: null,
      order_overdue: false,
    },
    {
      part_code: '90105-00010',
      part_name: '六角フランジボルト M8×25',
      warehouse: '第2倉庫',
      available_quantity: 420,
      incoming_quantity: 0,
      incoming_plans: [],
      total_required_quantity: 160,
      shortage_quantity: 0,
      shortage_plan_id: null,
      shortage_plan_name: null,
      shortage_date: null,
      lead_time_days: 7,
      order_by_date: null,
      order_overdue: false,
    },
  ],
};

const INSPECTION_ITEMS = [
  {
    id: 'insp-1',
    code: 'INSP-PRC-001',
    name: 'ブラケット溶接 寸法・外観検査',
    description: '溶接後の取付ピッチ寸法およびビード外観の確認',
    inspection_type: 'in_process',
    inspection_type_display: '工程内検査',
    target_object_type: 'wip',
    target_object_type_display: '仕掛品',
    is_active: true,
    measurement_details: [
      {
        id: 'md-1',
        name: '取付穴ピッチ寸法',
        measurement_type: 'quantitative',
        specification_nominal: 120.0,
        specification_upper_limit: 120.5,
        specification_lower_limit: 119.5,
        specification_unit: 'mm',
        order: 1,
      },
      {
        id: 'md-2',
        name: '溶接ビード外観（スパッタ・割れ）',
        measurement_type: 'qualitative',
        expected_qualitative_result: '良好（割れ・アンダーカットなし）',
        order: 2,
      },
    ],
  },
  {
    id: 'insp-2',
    code: 'INSP-ACC-001',
    name: 'プレス部品 受入寸法検査',
    description: '入荷ロットごとの板厚および外観確認',
    inspection_type: 'acceptance',
    inspection_type_display: '受入検査',
    target_object_type: 'part',
    target_object_type_display: '部品',
    is_active: true,
    measurement_details: [
      {
        id: 'md-3',
        name: '板厚測定',
        measurement_type: 'quantitative',
        specification_nominal: 3.2,
        specification_upper_limit: 3.35,
        specification_lower_limit: 3.05,
        specification_unit: 'mm',
        order: 1,
      },
    ],
  },
  {
    id: 'insp-3',
    code: 'INSP-EQP-001',
    name: '溶接ロボット 始業点検',
    description: '稼働前のガス圧力・トーチ清掃・非常停止ボタン確認',
    inspection_type: 'patrol',
    inspection_type_display: '巡回検査',
    target_object_type: 'equipment',
    target_object_type_display: '設備',
    is_active: true,
    measurement_details: [
      {
        id: 'md-4',
        name: 'シールドガス流量',
        measurement_type: 'quantitative',
        specification_nominal: 15.0,
        specification_upper_limit: 18.0,
        specification_lower_limit: 12.0,
        specification_unit: 'L/min',
        order: 1,
      },
      {
        id: 'md-5',
        name: '非常停止・安全柵インターロック',
        measurement_type: 'qualitative',
        expected_qualitative_result: '正常作動',
        order: 2,
      },
    ],
  },
];

const INSPECTION_FORM_DATA = {
  result_form_fields: [
    { name: 'part_number', type: 'text', label: '対象品番' },
    { name: 'lot_number', type: 'text', label: 'ロット番号' },
    { name: 'equipment_used', type: 'text', label: '使用設備' },
    { name: 'quantity_inspected', type: 'number', label: '検査数量' },
    {
      name: 'judgment',
      type: 'select',
      label: '総合判定',
      choices: [
        ['pass', '合格'],
        ['fail', '不合格'],
        ['conditional_pass', '条件付き合格'],
        ['pending', '保留'],
      ],
    },
    { name: 'remarks', type: 'textarea', label: '備考' },
  ],
  measurement_details: INSPECTION_ITEMS[0].measurement_details,
};

const INSPECTION_RESULTS = [
  {
    id: 'res-1',
    inspection_item: 'insp-1',
    inspected_at: isoFromToday(0, 10, 15),
    inspected_by: 1,
    inspected_by_username: '佐藤 健一',
    part_number: '71020-AK100',
    lot_number: 'LOT-20261028-01',
    serial_number: null,
    related_order_type: null,
    related_order_number: null,
    quantity_inspected: 5,
    judgment: 'pass',
    judgment_display: '合格',
    remarks: '初品・中品・終品とも規格内',
    attachment: null,
    equipment_used: 'WELD-RB-01',
    details: [
      { measurement_detail: 'md-1', measured_value_numeric: 120.1, result_qualitative: null },
      { measurement_detail: 'md-2', measured_value_numeric: null, result_qualitative: '良好（割れ・アンダーカットなし）' },
    ],
  },
  {
    id: 'res-2',
    inspection_item: 'insp-3',
    inspected_at: isoFromToday(0, 8, 10),
    inspected_by: 2,
    inspected_by_username: '鈴木 花子',
    part_number: null,
    lot_number: null,
    serial_number: null,
    related_order_type: null,
    related_order_number: null,
    quantity_inspected: 1,
    judgment: 'pass',
    judgment_display: '合格',
    remarks: '始業前点検異常なし',
    attachment: null,
    equipment_used: 'WELD-RB-01',
    details: [
      { measurement_detail: 'md-4', measured_value_numeric: 15.2, result_qualitative: null },
      { measurement_detail: 'md-5', measured_value_numeric: null, result_qualitative: '正常作動' },
    ],
  },
];

const MACHINES = [
  {
    id: 'mc-1',
    machine_number: 'WELD-RB-01',
    name: 'アーク溶接ロボット 1号機',
    location: '第1工場 Aライン',
    description: 'サブアッシー溶接用 6軸ロボット',
    created_at: '2025-04-01T09:00:00+09:00',
  },
  {
    id: 'mc-2',
    machine_number: 'PRESS-200T-01',
    name: '200t サーボプレス機',
    location: '第1工場 プレスエリア',
    description: 'ブラケット本体成形用',
    created_at: '2025-04-01T09:00:00+09:00',
  },
  {
    id: 'mc-3',
    machine_number: 'ASSY-LINE-01',
    name: '最終組付コンベアライン',
    location: '第1工場 Bライン',
    description: 'トルク管理ナットランナー付属',
    created_at: '2025-04-01T09:00:00+09:00',
  },
];

const QR_CODE_ACTIONS = [
  {
    id: 'qr-1',
    name: '棚番QRコード読取（倉庫・棚番自動セット）',
    action_type: 'script',
    qr_code_pattern: '^\\{"warehouse":.+"shelf":.+\\}$',
    description: '倉庫棚番QR作成で出力したJSON形式QRを読み取り、倉庫と棚番を入力欄に反映します。',
    script: 'import json\ndata = json.loads(qr_data)\nresult = {"action": "update_fields", "updateFields": {"warehouse": data["warehouse"], "location": data["shelf"]}}',
    is_active: true,
  },
  {
    id: 'qr-2',
    name: '発注伝票バーコード検索（モバイル入庫）',
    action_type: 'regex',
    qr_code_pattern: '^PO-[0-9]{4}-[0-9]+$',
    description: 'PO-から始まる発注番号を読み取った際に入庫予定の検索欄へセットします。',
    script: '',
    is_active: true,
  },
];

const MODEL_FIELDS_BY_TYPE = {
  inventory: [
    { name: 'part_number', verbose_name: '品番', field_type: 'CharField' },
    { name: 'warehouse', verbose_name: '倉庫', field_type: 'CharField' },
    { name: 'location', verbose_name: '棚番', field_type: 'CharField' },
    { name: 'quantity', verbose_name: '在庫数', field_type: 'IntegerField' },
    { name: 'reserved', verbose_name: '引当在庫', field_type: 'IntegerField' },
  ],
  stock_movement: [
    { name: 'part_number', verbose_name: '品番', field_type: 'CharField' },
    { name: 'warehouse', verbose_name: '倉庫', field_type: 'CharField' },
    { name: 'reference_document', verbose_name: '参照ドキュメント', field_type: 'CharField' },
  ],
  purchase_order: [
    { name: 'order_number', verbose_name: '発注番号', field_type: 'CharField' },
    { name: 'supplier', verbose_name: '仕入先', field_type: 'CharField' },
    { name: 'item', verbose_name: '品目', field_type: 'CharField' },
    { name: 'product_name', verbose_name: '品名', field_type: 'CharField' },
    { name: 'quantity', verbose_name: '発注数量', field_type: 'IntegerField' },
    { name: 'received_quantity', verbose_name: '入庫済数量', field_type: 'IntegerField' },
    { name: 'expected_arrival', verbose_name: '入荷予定日', field_type: 'DateTimeField' },
    { name: 'warehouse', verbose_name: '倉庫', field_type: 'CharField' },
  ],
  goods_receipt: [
    { name: 'order_number', verbose_name: '発注番号', field_type: 'CharField' },
    { name: 'item', verbose_name: '品目', field_type: 'CharField' },
    { name: 'warehouse', verbose_name: '倉庫', field_type: 'CharField' },
  ],
};

const DISPLAY_SETTINGS_BY_TYPE = {
  inventory: [
    { order: 1, model_field_name: 'part_number', display_name: '品番', is_list_display: true, is_search_field: true, is_list_filter: false, search_order: 1 },
    { order: 2, model_field_name: 'warehouse', display_name: '倉庫', is_list_display: true, is_search_field: true, is_list_filter: true, search_order: 2 },
    { order: 3, model_field_name: 'location', display_name: '場所', is_list_display: true, is_search_field: true, is_list_filter: false, search_order: 3 },
    { order: 4, model_field_name: 'quantity', display_name: '在庫数', is_list_display: true, is_search_field: false, is_list_filter: false, search_order: 4 },
    { order: 5, model_field_name: 'reserved', display_name: '引当在庫', is_list_display: true, is_search_field: false, is_list_filter: false, search_order: 5 },
  ],
  stock_movement: [
    { order: 1, model_field_name: 'movement_date', display_name: '移動日時', is_list_display: true, is_search_field: false, is_list_filter: false, search_order: 1 },
    { order: 2, model_field_name: 'part_number', display_name: '品番', is_list_display: true, is_search_field: true, is_list_filter: false, search_order: 1 },
    { order: 3, model_field_name: 'warehouse', display_name: '倉庫', is_list_display: true, is_search_field: true, is_list_filter: true, search_order: 2 },
    { order: 4, model_field_name: 'movement_type', display_name: '移動タイプ', is_list_display: true, is_search_field: false, is_list_filter: false, search_order: 3 },
    { order: 5, model_field_name: 'quantity', display_name: '数量', is_list_display: true, is_search_field: false, is_list_filter: false, search_order: 4 },
    { order: 6, model_field_name: 'operator', display_name: '記録者', is_list_display: true, is_search_field: false, is_list_filter: false, search_order: 5 },
    { order: 7, model_field_name: 'description', display_name: '備考', is_list_display: true, is_search_field: false, is_list_filter: false, search_order: 6 },
    { order: 8, model_field_name: 'reference_document', display_name: '参照ドキュメント', is_list_display: true, is_search_field: true, is_list_filter: false, search_order: 3 },
  ],
  purchase_order: [
    { order: 1, model_field_name: 'order_number', display_name: '発注番号', is_list_display: true, is_search_field: true, is_list_filter: false, search_order: 1 },
    { order: 2, model_field_name: 'supplier', display_name: '仕入先', is_list_display: true, is_search_field: true, is_list_filter: false, search_order: 2 },
    { order: 3, model_field_name: 'item', display_name: '品目', is_list_display: true, is_search_field: true, is_list_filter: false, search_order: 3 },
    { order: 4, model_field_name: 'product_name', display_name: '品名', is_list_display: true, is_search_field: false, is_list_filter: false, search_order: 4 },
    { order: 5, model_field_name: 'quantity', display_name: '発注数量', is_list_display: true, is_search_field: false, is_list_filter: false, search_order: 5 },
    { order: 6, model_field_name: 'received_quantity', display_name: '入庫済数量', is_list_display: true, is_search_field: false, is_list_filter: false, search_order: 6 },
    { order: 7, model_field_name: 'remaining_quantity', display_name: '残数量', is_list_display: true, is_search_field: false, is_list_filter: false, search_order: 7 },
    { order: 8, model_field_name: 'expected_arrival', display_name: '入荷予定日', is_list_display: true, is_search_field: false, is_list_filter: false, search_order: 8 },
    { order: 9, model_field_name: 'status', display_name: 'ステータス', is_list_display: true, is_search_field: false, is_list_filter: true, search_order: 9 },
  ],
  goods_receipt: [
    { order: 1, model_field_name: 'order_number', display_name: '発注番号', is_list_display: true, is_search_field: true, is_list_filter: false, search_order: 1 },
    { order: 2, model_field_name: 'item', display_name: '品目', is_list_display: true, is_search_field: true, is_list_filter: false, search_order: 2 },
    { order: 3, model_field_name: 'warehouse', display_name: '倉庫', is_list_display: true, is_search_field: true, is_list_filter: false, search_order: 3 },
  ],
};

const SECURITY_LOCKS = {
  users: [
    {
      id: 1,
      user_id: 'u-4',
      custom_id: 'takahashi_02',
      username: '高橋 誠',
      failure_count: 5,
      lock_level: 1,
      locked_until: isoFromToday(0, 11, 30),
      requires_admin_unlock: false,
      is_locked: true,
      last_failure_at: isoFromToday(0, 11, 0),
    },
  ],
  ips: [
    {
      id: 1,
      ip_address: '192.168.10.55',
      blocked_until: isoFromToday(0, 11, 45),
      failure_count: 20,
      created_at: isoFromToday(0, 11, 15),
    },
  ],
};

const SECURITY_LOGS = {
  count: 5,
  next: null,
  previous: null,
  total_pages: 1,
  current_page: 1,
  results: [
    {
      id: 5,
      created_at: isoFromToday(0, 11, 5),
      event_type: 'login_success',
      event_type_display: 'ログイン成功',
      user: 'u-1',
      username: 'admin_demo',
      ip_address: '192.168.10.12',
      user_agent: 'Mozilla/5.0',
      method: 'POST',
      path: '/api/users/token/',
      status_code: 200,
      detail: {},
    },
    {
      id: 4,
      created_at: isoFromToday(0, 11, 0),
      event_type: 'account_locked',
      event_type_display: 'アカウントロック',
      user: 'u-4',
      username: 'takahashi_02',
      ip_address: '192.168.10.24',
      user_agent: 'Mozilla/5.0',
      method: 'POST',
      path: '/api/users/token/',
      status_code: 403,
      detail: { lock_level: 1, failures: 5 },
    },
    {
      id: 3,
      created_at: isoFromToday(0, 10, 58),
      event_type: 'login_failed',
      event_type_display: 'ログイン失敗',
      user: 'u-4',
      username: 'takahashi_02',
      ip_address: '192.168.10.24',
      user_agent: 'Mozilla/5.0',
      method: 'POST',
      path: '/api/users/token/',
      status_code: 401,
      detail: { reason: 'invalid_credentials' },
    },
    {
      id: 2,
      created_at: isoFromToday(0, 9, 30),
      event_type: 'api_token_updated',
      event_type_display: 'APIトークン設定変更',
      user: 'u-1',
      username: 'admin_demo',
      ip_address: '192.168.10.12',
      user_agent: 'Mozilla/5.0',
      method: 'PATCH',
      path: '/api/users/u-3/token/',
      status_code: 200,
      detail: { target: 'akita_sync', scopes: ['inventory', 'master', 'production'] },
    },
    {
      id: 1,
      created_at: isoFromToday(0, 8, 30),
      event_type: 'login_success',
      event_type_display: 'ログイン成功',
      user: 'u-2',
      username: 'suzuki_01',
      ip_address: '192.168.10.18',
      user_agent: 'Mozilla/5.0',
      method: 'POST',
      path: '/api/users/token/',
      status_code: 200,
      detail: {},
    },
  ],
  event_types: [
    { value: 'login_success', label: 'ログイン成功' },
    { value: 'login_failed', label: 'ログイン失敗' },
    { value: 'account_locked', label: 'アカウントロック' },
    { value: 'api_token_updated', label: 'APIトークン設定変更' },
  ],
};

// ログイン画面の画像認証 (文字を描いただけの SVG)
const CAPTCHA_IMAGE = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="44"><rect width="140" height="44" fill="#f1f5f9"/>'
  + '<path d="M0 30 Q35 10 70 26 T140 16" stroke="#94a3b8" fill="none"/>'
  + '<text x="18" y="31" font-family="monospace" font-size="24" fill="#1e293b" transform="rotate(-3 70 22)">K7QMX</text></svg>',
).toString('base64')}`;

// ---- API モック ---------------------------------------------------------

const handleApi = async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace(/^\/api/, '');
  const method = request.method();
  const json = (body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  // 認証・ユーザー
  if (path === '/users/token/' && method === 'POST') {
    return json({ access: 'fake-access-token', refresh: 'fake-refresh-token' });
  }
  if (path === '/users/token/refresh/') return json({ access: 'fake-access-token' });
  if (path === '/users/session/') return json(SESSION_INFO);
  if (path === '/users/settings/') return json(USER_SETTINGS);
  if (path === '/users/settings/token/') return json({ api_token: USER_TOKEN_DETAIL.api_token });
  if (path === '/users/') return json({ results: USERS, count: USERS.length });
  if (/^\/users\/[^/]+\/token\/$/.test(path)) return json(USER_TOKEN_DETAIL);
  if (/^\/users\/[^/]+\/$/.test(path)) {
    const id = path.split('/')[2];
    return json(USERS.find((u) => u.id === id) || USERS[2]);
  }

  // 基本設定・表示設定
  if (path === '/base/info/') return json({ version: '0.1.31' });
  if (path === '/base/model-fields/') {
    const dt = url.searchParams.get('data_type') || 'inventory';
    return json(MODEL_FIELDS_BY_TYPE[dt] || MODEL_FIELDS_BY_TYPE.inventory);
  }
  if (path === '/base/model-display-settings/') {
    const dt = url.searchParams.get('data_type') || 'inventory';
    return json(DISPLAY_SETTINGS_BY_TYPE[dt] || []);
  }
  if (path === '/base/qr-code-actions/') return json(QR_CODE_ACTIONS);

  // 在庫管理
  if (path === '/inventory/inventories/') {
    return json({ count: INVENTORIES.length, next: null, previous: null, results: INVENTORIES });
  }
  if (path === '/inventory/inventories/by-location/') {
    return json([INVENTORIES[0]]);
  }
  if (path === '/inventory/stock-movements/') {
    return json({
      count: STOCK_MOVEMENTS.length,
      total_pages: 1,
      current_page: 1,
      next: null,
      previous: null,
      results: STOCK_MOVEMENTS,
    });
  }
  if (path === '/inventory/sales-orders/') {
    return json({
      count: SALES_ORDERS.length,
      total_pages: 1,
      current_page: 1,
      page_size: 25,
      next: null,
      previous: null,
      results: SALES_ORDERS,
    });
  }
  if (/^\/inventory\/sales-orders\/[^/]+\/location-map\/$/.test(path)) {
    return json({
      data: {
        warehouse: { warehouse_number: '第1倉庫', name: '本社第1倉庫（組立・部材）', cols: 12, rows: 8 },
        locations: WAREHOUSE_LOCATIONS.map((loc, idx) => ({
          ...loc,
          quantity: idx === 0 ? 45 : idx === 1 ? 15 : 0,
          highlighted: idx === 0 || idx === 1,
        })),
      },
    });
  }
  if (path === '/inventory/purchase-orders/') {
    return json({
      count: PURCHASE_ORDERS.length,
      total_pages: 1,
      current_page: 1,
      next: null,
      previous: null,
      results: PURCHASE_ORDERS,
    });
  }

  // 生産管理
  if (path === '/production/plans/') {
    return json({ count: PRODUCTION_PLANS.length, next: null, previous: null, results: PRODUCTION_PLANS });
  }
  if (/^\/production\/plans\/[^/]+\/intermediate-requirements\/$/.test(path)) {
    return json(INTERMEDIATE_REQUIREMENTS);
  }
  if (/^\/production\/plans\/[^/]+\/required-parts\/$/.test(path)) {
    return json(REQUIRED_PARTS);
  }
  if (path === '/production/material-allocations/') {
    return json({ count: MATERIAL_ALLOCATIONS.length, next: null, previous: null, results: MATERIAL_ALLOCATIONS });
  }
  if (path === '/production/parts-supply-simulation/') {
    return json(SIMULATION_RESULT);
  }
  if (path === '/production/work-progress/') {
    return json({ count: 0, next: null, previous: null, results: [] });
  }

  // マスタ管理
  if (path === '/master/bill-of-materials/') return json({ data: BOM_ITEMS });
  if (path === '/master/bill-of-materials/explode/') return json({ data: BOM_EXPLOSION });
  if (path === '/master/items/') return json({ data: MASTER_ITEMS, results: MASTER_ITEMS });
  if (path === '/master/suppliers/') return json({ data: SUPPLIERS, results: SUPPLIERS });
  if (path === '/master/warehouses/') return json({ data: WAREHOUSES, results: WAREHOUSES });
  if (path === '/master/warehouse-locations/') return json({ data: WAREHOUSE_LOCATIONS });

  // 品質管理・設備管理
  if (path === '/quality/inspection-items/') return json({ data: INSPECTION_ITEMS });
  if (/^\/quality\/inspection-items\/[^/]+\/form-data\/$/.test(path)) return json(INSPECTION_FORM_DATA);
  if (/^\/quality\/inspection-items\/[^/]+\/$/.test(path)) {
    const id = path.split('/')[3];
    return json({ data: INSPECTION_ITEMS.find((i) => i.id === id) || INSPECTION_ITEMS[0] });
  }
  if (path === '/quality/inspection-results/') return json({ data: INSPECTION_RESULTS });
  if (path === '/machine/machines/') return json({ data: MACHINES });

  // セキュリティ
  if (path === '/security/locks/') return json(SECURITY_LOCKS);
  if (path === '/security/access-logs/') return json(SECURITY_LOGS);
  if (path === '/security/captcha/') return json({ key: 'demo-key', image: CAPTCHA_IMAGE });

  return json({});
};

// ---- 撮影 ---------------------------------------------------------------

const main = async () => {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    args: ['--lang=ja-JP'],
    env: { ...process.env, LANGUAGE: 'ja', LANG: 'ja_JP.UTF-8' },
  });

  const newDesktopContext = async (api, authenticated = true) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      colorScheme: 'light',
    });
    if (authenticated) {
      await context.addInitScript(() => {
        localStorage.setItem('access_token', 'fake-access-token');
        localStorage.setItem('refresh_token', 'fake-refresh-token');
      });
    }
    await context.route((url) => url.pathname.startsWith('/api/'), api);
    return context;
  };

  const shoot = async (target, name, { fullPage = false } = {}) => {
    await target.waitForLoadState('networkidle');
    await target.screenshot({ path: `${OUT_DIR}${name}.png`, animations: 'disabled', fullPage });
    console.log(`  saved ${name}.png`);
  };

  console.log(`Capturing ${BASE_URL} -> ${OUT_DIR}`);

  // 1. ログイン画面 (未認証状態からログインする)
  const loginContext = await newDesktopContext(handleApi, false);
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`${BASE_URL}/login`);
  await loginPage.locator('#custom_id').fill('admin_demo');
  await loginPage.locator('#password').fill('password');
  await shoot(loginPage, '01-login');
  await loginContext.close();

  // 2. 画像認証を求められたログイン画面
  const captchaContext = await newDesktopContext(async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/users/token/' && route.request().method() === 'POST') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'ログインの失敗が続いたため、画像の文字も入力してください。',
          code: 'captcha_required',
          captcha_required: true,
        }),
      });
    }
    return handleApi(route);
  }, false);
  const captchaPage = await captchaContext.newPage();
  await captchaPage.goto(`${BASE_URL}/login`);
  await captchaPage.locator('#custom_id').fill('takahashi_02');
  await captchaPage.locator('#password').fill('password');
  await captchaPage.getByRole('button', { name: 'ログイン' }).click();
  await captchaPage.locator('#captcha_value').fill('K7QMX');
  await shoot(captchaPage, '02-login-captcha');
  await captchaContext.close();

  // 3. デスクトップ各画面
  const context = await newDesktopContext(handleApi, true);
  const page = await context.newPage();

  // トップページとメニュー
  await page.goto(`${BASE_URL}/`);
  await page.locator('.top-page-container').waitFor();
  await shoot(page, '03-top');
  await page.locator('#hamburger-menu').click();
  await page.locator('#menu-bar.open').waitFor();
  await page.waitForTimeout(350);
  await shoot(page, '04-menu');

  // 在庫照会・在庫移動モーダル
  await page.goto(`${BASE_URL}/inventory/inquiry`);
  await page.getByRole('heading', { name: '在庫照会' }).waitFor();
  await page.getByRole('button', { name: '移動' }).first().waitFor();
  await shoot(page, '05-inventory-inquiry');
  await page.getByRole('button', { name: '移動' }).first().click();
  await page.locator('#move_quantity_input').fill('15');
  await page.locator('#move_target_warehouse_input').fill('第1倉庫');
  await page.locator('#move_target_location_input').fill('A-01-02');
  await shoot(page, '06-inventory-move-modal');

  // 入出庫履歴
  await page.goto(`${BASE_URL}/inventory/stock-movement-history`);
  await page.getByRole('heading', { name: '入出庫履歴', exact: true }).waitFor();
  await page.locator('#schedule-table tbody tr').first().waitFor();
  await shoot(page, '07-stock-movement-history');

  // 出庫予定
  await page.goto(`${BASE_URL}/inventory/shipment`);
  await page.getByRole('heading', { name: '出庫予定一覧' }).waitFor();
  await page.locator('table tbody tr').first().waitFor();
  await shoot(page, '08-shipment-schedule');

  // 入庫処置
  await page.goto(`${BASE_URL}/inventory/purchase`);
  await page.getByRole('heading', { name: '入庫処置' }).waitFor();
  await page.getByRole('button', { name: '入庫', exact: true }).first().waitFor();
  await shoot(page, '09-goods-receipt');
  await page.getByRole('button', { name: '入庫', exact: true }).first().click();
  await page.getByRole('heading', { name: '入庫処理' }).waitFor();
  await shoot(page, '10-goods-receipt-modal');

  // 出庫処理・ロケーション地図
  await page.goto(`${BASE_URL}/inventory/issue`);
  await page.getByRole('heading', { name: '出庫処理' }).waitFor();
  await page.getByRole('button', { name: '地図で確認' }).first().waitFor();
  await shoot(page, '11-goods-issue');
  await page.getByRole('button', { name: '地図で確認' }).first().click();
  await page.getByRole('heading', { name: '出庫ロケーション地図' }).waitFor();
  await page.locator('.modal-content svg').waitFor();
  await shoot(page, '12-goods-issue-map');

  // 生産計画・中間品手配・材料引当
  await page.goto(`${BASE_URL}/production/plan`);
  await page.getByRole('heading', { name: '生産計画検索' }).waitFor();
  await page.getByRole('button', { name: '材料引当' }).first().waitFor();
  await shoot(page, '13-production-plan');
  await page.getByRole('button', { name: /中間品/ }).first().click();
  await page.getByRole('heading', { name: /中間品の手配/ }).waitFor();
  await page.getByRole('button', { name: '子計画を立てる' }).waitFor();
  await shoot(page, '14-production-plan-intermediates');
  await page.locator('.modal-content').getByRole('button', { name: '閉じる' }).click();
  await page.getByRole('button', { name: '材料引当' }).first().click();
  await page.getByRole('heading', { name: '材料引き当て' }).waitFor();
  await page.getByRole('button', { name: '引き当て実行' }).waitFor();
  await shoot(page, '15-production-plan-allocate');

  // 使用部品マスター・多階層展開
  await page.goto(`${BASE_URL}/production/bom-master`);
  await page.getByRole('heading', { name: '使用部品マスター管理' }).waitFor();
  await page.locator('table tbody tr').first().waitFor();
  await shoot(page, '16-bom-master');
  await page.locator('table').getByRole('button', { name: '展開' }).first().click();
  await page.getByRole('heading', { name: '部品構成の展開（多階層）' }).waitFor();
  await page.getByText('最下位の材料の合計所要量').waitFor();
  await shoot(page, '17-bom-explode');

  // 材料引当ステータス一覧
  await page.goto(`${BASE_URL}/production/material-allocation`);
  await page.getByRole('heading', { name: '材料引当ステータス一覧' }).waitFor();
  await page.locator('table tbody tr').first().waitFor();
  await shoot(page, '18-material-allocation');

  // 部品供給シミュレーション
  await page.goto(`${BASE_URL}/production/parts-supply-simulation`);
  await page.getByRole('heading', { name: '部品供給シミュレーション' }).waitFor();
  await page.getByRole('button', { name: 'シミュレーション実行' }).click();
  await page.getByText('生産計画別の生産可否（納期順）').waitFor();
  await shoot(page, '19-parts-supply-simulation', { fullPage: true });

  // 作業進捗
  await page.goto(`${BASE_URL}/production/work-progress`);
  await page.getByRole('heading', { name: '作業進捗 - 生産計画一覧' }).waitFor();
  await page.getByRole('button', { name: '進捗確認' }).first().waitFor();
  await shoot(page, '20-work-progress');
  await page.getByRole('button', { name: '進捗確認' }).first().click();
  await page.getByRole('heading', { name: /作業進捗確認/ }).waitFor();
  await page.locator('.modal-content').getByRole('button', { name: '完了' }).click();
  await page.locator('#modalActualQuantity').fill('20');
  await page.locator('#modalDefectiveQuantity').fill('1');
  await shoot(page, '21-work-progress-modal');

  // 工程内検査・検査実施モーダル
  await page.goto(`${BASE_URL}/quality/process-inspection`);
  await page.getByRole('heading', { name: '工程内検査 登録' }).waitFor();
  await page.locator('table tbody button').first().waitFor();
  await shoot(page, '22-process-inspection');
  await page.locator('table tbody button').first().click();
  await page.getByRole('heading', { name: /検査実施:/ }).waitFor();
  await page.locator('#id_part_number').fill('71020-AK100');
  await page.locator('#id_lot_number').fill('LOT-20261028-01');
  await page.locator('#id_equipment_used').fill('WELD-RB-01');
  await page.locator('#id_quantity_inspected').fill('5');
  await page.locator('#id_judgment').selectOption('pass');
  await shoot(page, '23-inspection-result-modal');

  // 検査項目マスター管理
  await page.goto(`${BASE_URL}/quality/master-creation`);
  await page.getByRole('heading', { name: '検査項目マスター管理' }).waitFor();
  await page.getByRole('button', { name: '変更' }).first().waitFor();
  await shoot(page, '24-quality-master');
  await page.getByRole('button', { name: '変更' }).first().click();
  await page.getByRole('button', { name: '詳細追加' }).waitFor();
  await shoot(page, '25-quality-master-modal');

  // 始業点検・点検履歴・設備マスター
  await page.goto(`${BASE_URL}/machine/start-inspection`);
  await page.getByRole('heading', { name: '始業点検 (点検開始)' }).waitFor();
  await page.locator('.list-group-item').first().click();
  await page.getByRole('button', { name: '点検開始' }).first().waitFor();
  await shoot(page, '26-start-inspection');

  await page.goto(`${BASE_URL}/machine/inspection-history`);
  await page.getByRole('heading', { name: '点検・検査履歴' }).waitFor();
  await page.locator('table tbody tr').first().click();
  await page.getByText('測定値・判定結果内訳').waitFor();
  await shoot(page, '27-inspection-history', { fullPage: true });

  await page.goto(`${BASE_URL}/machine/master-creation`);
  await page.getByRole('heading', { name: 'マスター作成（設備管理）' }).waitFor();
  await page.locator('table tbody tr').first().waitFor();
  await shoot(page, '28-machine-master');

  // データ投入
  await page.goto(`${BASE_URL}/data/import`);
  await page.getByRole('heading', { name: 'データインポート・管理' }).waitFor();
  await page.locator('#csvDataType').selectOption('item');
  await shoot(page, '29-data-import', { fullPage: true });
  await page.getByRole('button', { name: '一覧表示' }).first().click();
  await page.locator('.modal-dialog table tbody tr').first().waitFor();
  await shoot(page, '30-data-import-list-modal');

  // ユーザー設定
  await page.goto(`${BASE_URL}/user/settings`);
  await page.getByRole('heading', { name: 'ユーザー設定' }).waitFor();
  await page.waitForFunction(() => {
    const el = document.querySelector('#username');
    return el && el.value.length > 0;
  });
  await shoot(page, '31-user-settings');

  // ユーザー管理・外部連携APIトークン・セキュリティ
  await page.goto(`${BASE_URL}/user/management`);
  await page.getByRole('heading', { name: 'ユーザー管理' }).waitFor();
  await page.locator('table tbody tr').first().waitFor();
  await shoot(page, '32-user-management');
  await page.getByRole('link', { name: '編集' }).nth(2).click();
  await page.getByRole('heading', { name: 'ユーザー編集' }).waitFor();
  await page.getByRole('heading', { name: 'APIトークン管理（外部システム連携用）' }).waitFor();
  await shoot(page, '33-user-edit-token', { fullPage: true });

  await page.goto(`${BASE_URL}/system/security`);
  await page.getByRole('heading', { name: 'セキュリティ' }).waitFor();
  await page.getByText('takahashi_02').waitFor();
  await shoot(page, '34-security');
  await page.getByRole('tab', { name: 'アクセスログ' }).click();
  await page.getByRole('cell', { name: 'ログイン成功' }).first().waitFor();
  await shoot(page, '35-security-logs');

  // システム設定・項目表示・QR・倉庫レイアウト
  await page.goto(`${BASE_URL}/system/settings`);
  await page.getByRole('heading', { name: 'システム設定' }).waitFor();
  await shoot(page, '36-system-settings');

  await page.goto(`${BASE_URL}/system/page-display-settings`);
  await page.getByRole('heading', { name: 'ページ項目表示設定' }).waitFor();
  await page.locator('table tbody tr').first().waitFor();
  await shoot(page, '37-page-display-settings', { fullPage: true });

  await page.goto(`${BASE_URL}/system/qr-code-actions`);
  await page.getByRole('heading', { name: 'QRコードアクション設定' }).waitFor();
  await page.locator('table tbody tr').first().waitFor();
  await shoot(page, '38-qr-code-actions');

  await page.goto(`${BASE_URL}/system/shelf-qr-code`);
  await page.getByRole('heading', { name: '倉庫棚番QR作成' }).waitFor();
  await page.locator('#warehouse-input').fill('第1倉庫');
  await page.locator('#shelf-input').fill('A-01-02');
  await page.locator('#include-label-check').check();
  await page.locator('#qr-code-canvas').waitFor();
  await shoot(page, '39-shelf-qr-code');

  await page.goto(`${BASE_URL}/master/warehouse-layout`);
  await page.getByRole('heading', { name: '倉庫レイアウト管理' }).waitFor();
  await page.locator('svg').first().waitFor();
  await shoot(page, '40-warehouse-layout');

  await context.close();

  // 4. モバイル画面 (MobileRedirector がモバイルと判定するよう iPhone 13 設定を使用)
  const mobileContext = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    colorScheme: 'light',
  });
  await mobileContext.addInitScript(() => {
    localStorage.setItem('access_token', 'fake-access-token');
    localStorage.setItem('refresh_token', 'fake-refresh-token');
  });
  await mobileContext.route((url) => url.pathname.startsWith('/api/'), handleApi);

  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE_URL}/mobile`);
  await mobilePage.getByRole('heading', { name: 'ようこそ！' }).waitFor();
  await shoot(mobilePage, '41-mobile-top');

  await mobilePage.goto(`${BASE_URL}/mobile/goods-receipt`);
  await mobilePage.getByRole('heading', { name: '入庫処理' }).waitFor();
  await mobilePage.getByRole('button', { name: '入庫処理' }).first().click();
  await mobilePage.getByRole('button', { name: '入庫実行' }).waitFor();
  await shoot(mobilePage, '42-mobile-goods-receipt');

  await mobilePage.goto(`${BASE_URL}/mobile/goods-issue`);
  await mobilePage.getByRole('heading', { name: '出庫処理' }).waitFor();
  await mobilePage.locator('#sales-order-list .card').first().waitFor();
  await shoot(mobilePage, '43-mobile-goods-issue');

  await mobilePage.goto(`${BASE_URL}/mobile/location-transfer`);
  await mobilePage.getByRole('heading', { name: '棚番移動' }).waitFor();
  await mobilePage.locator('#warehouse_input').fill('第1倉庫');
  await mobilePage.locator('#source_location_input').fill('A-01-01');
  await mobilePage.getByRole('button', { name: '次へ' }).click();
  await mobilePage.getByRole('heading', { name: '在庫移動' }).waitFor();
  await mobilePage.locator('#transferQuantity').fill('10');
  await mobilePage.locator('#targetLocation').fill('A-01-02');
  await shoot(mobilePage, '44-mobile-location-transfer');

  await mobileContext.close();
  await browser.close();
  console.log('Done.');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
