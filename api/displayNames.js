/** 既存：シートのブランドより優先する補正 */
export const EXISTING_BRAND_OVERRIDE = {
  プリチャーカール: "Technogym",
};

/** 既存：メーカー名を付けない／別名にする */
export const EXISTING_NAME_OVERRIDE = {
  ダンベルラック: null, // 一覧から除外（ダンベルエリアに分割）
};

/** メーカー名＋日本語名の表示用マップ（新マシンの英語名称 → 表示名） */
export const NEW_DISPLAY_NAMES = {
  "HD Athletic NX Half Half Combo Rack": "Hammer Strength　ハーフハーフコンボラック",
  "Impact Suppression Platform / Platform床材": "Life Fitness　ISP床材（プラットフォーム）",
  "ラバーダンベル EVA-D104 42.5kg～60kg追加": "Evolgear　ラバーダンベル（42.5–60kg追加）",
  "アジャスタブルインクリンベンチ EVRB-L139": "Evolgear　アジャスタブルインクリンベンチ",
  "Selectorized 3D Multi-Abductor Pro": "Matrix　3Dマルチアブダクター Pro",
  "Hip Thrust Elite": "Arsenal Strength　ヒップスラスト Elite",
  "Deadlift Elite": "Arsenal Strength　デッドリフト Elite",
  "Reloaded T Bar Row": "Arsenal Strength　Tバーロウ Reloaded",
  "Pure Kraft High Row Dual": "Life Fitness　ハイロウ Dual（Pure Kraft）",
  "Pure Kraft Low Row Dual": "Life Fitness　ロウロウ Dual（Pure Kraft）",
  "Pure Kraft Bent Over Row": "Life Fitness　ベントオーバーロウ（Pure Kraft）",
  "Seated Row Machine / Dual Row系": "Life Fitness　シーテッドロウ / Dual Row",
  "Pure Kraft Shoulder Lateral Raise Dual": "Life Fitness　サイドレイズ Dual（Pure Kraft）",
  "Pure Kraft Hack Squat": "Life Fitness　ハックスクワット（Pure Kraft）",
  "Pure Kraft Lying Leg Curl": "Life Fitness　ライイングレッグカール（Pure Kraft）",
  "Pure Kraft Leg Extension": "Life Fitness　レッグエクステンション（Pure Kraft）",
  "Pure Kraft 55 Degrees Standing Calf Raise": "Life Fitness　スタンディングカーフレイズ（Pure Kraft）",
  "Pure Kraft Belt Squat": "Life Fitness　ベルトスクワット（Pure Kraft）",
  "Pure Kraft Pendulum Squat": "Life Fitness　ペンデュラムスクワット（Pure Kraft）",
  "Pure Kraft Biceps Curl Dual": "Life Fitness　バイセプスカール Dual（Pure Kraft）",
  "Pure Kraft Triceps Extension": "Life Fitness　トライセプスエクステンション（Pure Kraft）",
  "ELC シーテッドロウ": "Life Fitness　シーテッドロウ（ELC）",
  "ELC ラテラルレイズ": "Life Fitness　ラテラルレイズ（ELC）",
  "Hammer Strength Select Leg Extension": "Hammer Strength　レッグエクステンション（Select）",
  "Hammer Strength Select Leg Curl": "Hammer Strength　レッグカール（Select）",
  "Abdominal Crunch": "Matrix　アブドミナルクランチ",
  "Assist Dip Chin": "Matrix　アシストディップ／チン",
  "Assist Dip & Chin": "Hammer Strength　アシストディップ／チン",
  "Insignia Series Chest Press": "Life Fitness　チェストプレス（Insignia）",
  "Standing Abductor": "Life Fitness　スタンディングアブダクター",
  "SkiErg PM5 スタンド付": "Concept2　スキーエルゴ PM5（スタンド付）",
  "RowErg": "Concept2　ローイングエルゴ",
  "BikeErg": "Concept2　バイクエルゴ",
  "POWER MAX V3 Pro": "POWER MAX　V3 Pro",
  "PowerMill Climber": "StairMaster　パワーミルクライマー",
  "C50 ClimbMill": "StairMaster　クライムミル C50",
  "10G StepMill": "StairMaster　ステップミル 10G",
  "Curve Treadmill": "Woodway　カーブトレッドミル",
  "Integrity+ Treadmill": "Life Fitness　トレッドミル（Integrity+）",
  "Integrity+ Cross Trainer": "Life Fitness　クロストレーナー（Integrity+）",
  "ONI 鬼コンボラック IPF公認": "ONI　鬼コンボラック（IPF公認）",
  "フラットベンチ EVRB-C135": "Evolgear　フラットベンチ",
  "オリンピックバー EVA-5000": "Evolgear　オリンピックバー",
  "プレートツリー EVRB-C154": "Evolgear　プレートツリー",
  "Rogue Deadlift Jack": "Rogue　デッドリフトジャック",
  "Wall Ball": "Wall Ball　ウォールボール",
  "Kettlebell Set": "ケトルベル　セット",
  "アタッチメントラック": "アタッチメントラック",
  "Tire Flip / Strongman Tire": "Strongman　タイヤ（フリップ用）",
  "Dog Sled 1.2": "Dog Sled　1.2",
  "Farmer's Walk Handles": "Farmer's Walk　ハンドル",
  "LB-1 Rogue 10 inch Log Bar": "Rogue　ログバー LB-1（10インチ）",
  "Y-2 Yoke": "Yoke　Y-2",
  "Strongman Sandbag Set": "Strongman　サンドバッグセット",
};

/** 既存マシンのブランド表記ゆれ */
export function formatBrand(brand) {
  const b = String(brand || "").trim();
  if (!b) return "";
  const map = {
    Cybex: "CYBEX",
    CYBEX: "CYBEX",
    Technogym: "Technogym",
    TECHNOGYM: "Technogym",
    BULL: "BULL",
    Bull: "BULL",
  };
  return map[b] || b;
}

export function displayExisting(name, brand) {
  const n = String(name || "").trim();
  if (!n) return "";
  const brandForced = EXISTING_BRAND_OVERRIDE[n];
  const b = formatBrand(brandForced != null ? brandForced : brand);
  if (!b) return n;
  if (n.toLowerCase().includes(b.toLowerCase())) return n;
  return `${b}　${n}`;
}

/** ダンベルエリア4パターン（メーカー名はタイトルに出さない） */
export const DUMBBELL_AREA_MACHINES = [
  {
    id: "dumbbell_area_12_30",
    name: "ダンベルエリア 12–30kg",
    brand: "",
    model: "IVANKO",
    width_cm: 240,
    length_cm: 70,
    qty: 1,
    note: "IVANKO",
  },
  {
    id: "dumbbell_area_32_40",
    name: "ダンベルエリア 32–40kg",
    brand: "",
    model: "ZIVA",
    width_cm: 220,
    length_cm: 70,
    qty: 1,
    note: "ZIVA",
  },
  {
    id: "dumbbell_area_1_10_a",
    name: "ダンベルエリア 1–10kg",
    brand: "",
    model: "1–10kg",
    width_cm: 100,
    length_cm: 100,
    qty: 1,
    note: "2セットのうち1",
  },
  {
    id: "dumbbell_area_1_10_b",
    name: "ダンベルエリア 1–10kg（2セット目）",
    brand: "",
    model: "1–10kg",
    width_cm: 100,
    length_cm: 100,
    qty: 1,
    note: "2セットのうち2",
  },
];

export function displayNew(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  return NEW_DISPLAY_NAMES[n] || n;
}
