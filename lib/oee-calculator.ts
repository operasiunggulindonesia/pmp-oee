////////////////////////////////////////////////////////////////
// UTIL
////////////////////////////////////////////////////////////////

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

////////////////////////////////////////////////////////////////
// INTERFACE
////////////////////////////////////////////////////////////////

export interface OEEMetrics {
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
}

/**
 * Interface lama dashboard
 */
export interface DailyRow {
  es_keluar: number;
  total_rusak: number;
  total_beban: number;
  beban_normal: number; // ← ditambahkan untuk rumus Availability
  jumlah_mesin: number;
  prod_jam: number;
}

/**
 * Interface khusus rumus Ponorogo
 */
export interface BalokDailyRow {
  es_keluar: number;
  es_rusak: number;
  total_beban: number;
  beban_normal: number;
}

////////////////////////////////////////////////////////////////
// CAPACITY SHIFT (PONOROGO)
// Satuan internal: h × 105 + m
////////////////////////////////////////////////////////////////

export function calcCapacity(shiftStart: string, shiftEnd: string): number {
  const toParts = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return { h, m };
  };

  const s = toParts(shiftStart);
  const e = toParts(shiftEnd);

  const start = s.h * 105 + s.m;
  const end   = e.h * 105 + e.m;

  return end - start;
}

////////////////////////////////////////////////////////////////
// OEE HARIAN BALOK PONOROGO
////////////////////////////////////////////////////////////////

/**
 * Menghitung OEE untuk satu baris data harian.
 *
 * Availability = (capacity - beban_normal) / capacity
 * Performance  = es_keluar / capacity
 * Quality      = (es_keluar - es_rusak) / es_keluar
 * OEE          = Availability × Performance × Quality
 */
export function calcDailyOEEBalokPonorogo(
  row: BalokDailyRow,
  capacity: number,
): OEEMetrics {
  if (!capacity || !row.total_beban || !row.es_keluar) {
    return { availability: null, performance: null, quality: null, oee: null };
  }

  // Availability: waktu produktif dibanding kapasitas shift
  const availability = clamp01((capacity - row.beban_normal) / capacity);

  // Performance: rata-rata produksi harian (1 baris = 1 hari) dibanding kapasitas
  const performance = clamp01(row.es_keluar / capacity);

  // Quality: produk baik dibanding total produksi
  const quality = clamp01((row.es_keluar - row.es_rusak) / row.es_keluar);

  return {
    availability,
    performance,
    quality,
    oee: availability * performance * quality,
  };
}

////////////////////////////////////////////////////////////////
// OEE AGREGAT BULANAN BALOK PONOROGO
////////////////////////////////////////////////////////////////

/**
 * Menghitung OEE agregat dari kumpulan baris harian.
 *
 * Availability = rata-rata harian (capacity - beban_normal) / capacity
 * Performance  = (total es_keluar / jumlah hari) / capacity
 * Quality      = (total es_keluar - total es_rusak) / total es_keluar
 * OEE          = Availability × Performance × Quality
 */
export function calcAggOEEBalokPonorogo(
  rows: BalokDailyRow[],
  capacity: number,
): OEEMetrics {
  const n = rows.length;

  if (!n) {
    return { availability: null, performance: null, quality: null, oee: null };
  }

  const totalKeluar = rows.reduce((s, r) => s + r.es_keluar, 0);
  const totalRusak  = rows.reduce((s, r) => s + r.es_rusak,  0);

  // Availability: rata-rata (capacity - beban_normal) / capacity per hari
  const avgAvail =
    rows.reduce((s, r) => s + (capacity - r.beban_normal) / capacity, 0) / n;
  const availability = clamp01(avgAvail);

  // Performance: (total es_keluar / jumlah hari) / capacity
  const performance = clamp01(totalKeluar / n / capacity);

  // Quality: total baik / total keluar
  const quality = clamp01((totalKeluar - totalRusak) / totalKeluar);

  return {
    availability,
    performance,
    quality,
    oee: availability * performance * quality,
  };
}

////////////////////////////////////////////////////////////////
// WRAPPER UNTUK DASHBOARD LAMA
////////////////////////////////////////////////////////////////

/**
 * Mempertahankan API lama dashboard dengan rumus Ponorogo yang sudah diperbaiki.
 *
 * Availability = rata-rata harian (capacity - beban_normal) / capacity
 * Performance  = (total es_keluar / jumlah hari) / capacity
 * Quality      = (total es_keluar - total rusak) / total es_keluar
 * OEE          = Availability × Performance × Quality
 *
 * Default shift Ponorogo: 00:00 – 23:00
 */
export function calcAggOEE(rows: DailyRow[]): OEEMetrics {
  const n = rows.length;

  if (!n) {
    return { availability: null, performance: null, quality: null, oee: null };
  }

  const totalKeluar = rows.reduce((s, r) => s + r.es_keluar,   0);
  const totalRusak  = rows.reduce((s, r) => s + r.total_rusak, 0);

  const capacity = calcCapacity("00:00", "23:00");

  // Availability: rata-rata (capacity - beban_normal) / capacity per hari
  const avgAvail =
    rows.reduce((s, r) => s + (capacity - (r.beban_normal ?? 0)) / capacity, 0) / n;
  const availability = clamp01(avgAvail);

  // Performance: (total es_keluar / jumlah hari) / capacity
  const performance = clamp01(totalKeluar / n / capacity);

  // Quality: total baik / total keluar
  const quality = clamp01((totalKeluar - totalRusak) / totalKeluar);

  return {
    availability,
    performance,
    quality,
    oee: availability * performance * quality,
  };
}

////////////////////////////////////////////////////////////////
// FORMATTER
////////////////////////////////////////////////////////////////

export const pct = (v: number | null, d = 1) =>
  v != null ? (v * 100).toFixed(d) + "%" : "–";

export const numFmt = (v: number | null | undefined) =>
  v != null ? Number(v).toLocaleString("id-ID") : "–";

////////////////////////////////////////////////////////////////
// STATUS COLOR
////////////////////////////////////////////////////////////////

export const statusColor = (v: number | null): string => {
  if (v == null)  return "#6b7280";
  if (v >= 0.85)  return "#10b981";
  if (v >= 0.65)  return "#f59e0b";
  return "#ef4444";
};

////////////////////////////////////////////////////////////////
// STATUS LABEL
////////////////////////////////////////////////////////////////

export const statusLabel = (v: number | null): string => {
  if (v == null)  return "–";
  if (v >= 0.85)  return "World Class";
  if (v >= 0.65)  return "Typical";
  return "Low";
};

////////////////////////////////////////////////////////////////
// STYLE BADGE
////////////////////////////////////////////////////////////////

export const pillStyle = (color: string): { bg: string; fg: string } => {
  const map: Record<string, { bg: string; fg: string }> = {
    "#10b981": { bg: "#d1fae5", fg: "#065f46" },
    "#f59e0b": { bg: "#fef3c7", fg: "#78350f" },
    "#ef4444": { bg: "#fee2e2", fg: "#7f1d1d" },
    "#6b7280": { bg: "#f3f4f6", fg: "#374151" },
  };

  return map[color] ?? { bg: "#f3f4f6", fg: "#374151" };
};