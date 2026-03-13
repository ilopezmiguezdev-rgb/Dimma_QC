#!/usr/bin/env node
/**
 * verify-bias-calc.js
 *
 * Verifies the Bias%, RandomError%, and TotalError% shown in the Statistics page
 * for a given equipment / lot / level / parameter combination.
 *
 * Usage:
 *   node tools/verify-bias-calc.js \
 *     --equipment QCA03 \
 *     --lot 2511664610 \
 *     --level "Control Nivel 1" \
 *     --param Urea \
 *     [--start 2026-01-01] \
 *     [--end 2026-03-13]
 *
 * Requires: node-fetch (or Node >= 18 with native fetch)
 * Environment: reads VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY from .env / Data Migration/.env
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- Load env vars ---
function loadEnv(filePath) {
  try {
    const lines = readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
    }
  } catch { /* file may not exist */ }
}
loadEnv(resolve(ROOT, '.env'));
loadEnv(resolve(ROOT, 'Data Migration/.env'));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in env files.');
  process.exit(1);
}

// --- Parse CLI args ---
const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const equipmentName = get('--equipment');
const lotNumber     = get('--lot');
const level         = get('--level');
const param         = get('--param');
const startDate     = get('--start');
const endDate       = get('--end');

if (!equipmentName || !lotNumber || !level || !param) {
  console.log('Usage: node tools/verify-bias-calc.js --equipment QCA03 --lot 2511664610 --level "Control Nivel 1" --param Urea [--start YYYY-MM-DD] [--end YYYY-MM-DD]');
  process.exit(1);
}

// --- Supabase helper ---
async function sb(table, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

// --- Stats (mirrors src/utils/qcStats.js exactly) ---
function calculateStats(data) {
  const valid = data.filter(v => v !== null && v !== undefined && !isNaN(parseFloat(v))).map(parseFloat);
  const n = valid.length;
  if (n === 0) return { mean: 0, stdDev: 0, cv: 0, n: 0 };
  const mean = valid.reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(valid.map(x => (x - mean) ** 2).reduce((a, b) => a + b, 0) / (n > 1 ? n - 1 : 1));
  const cv = mean === 0 ? 0 : (stdDev / mean) * 100;
  return { mean, stdDev, cv, n };
}

function calculateTotalError(labMean, targetValue, cvPercent, sd) {
  if (targetValue === 0 || targetValue == null || labMean == null || cvPercent == null) return null;
  const biasPercent        = (Math.abs(labMean - targetValue) / targetValue) * 100;
  const randomErrorPercent = 1.65 * cvPercent;
  const totalErrorPercent  = biasPercent + randomErrorPercent;
  const biasAbsolute       = Math.abs(labMean - targetValue);
  const randomErrorAbsolute = 1.65 * (sd ?? 0);
  const totalErrorAbsolute = biasAbsolute + randomErrorAbsolute;
  return { biasPercent, randomErrorPercent, totalErrorPercent, biasAbsolute, randomErrorAbsolute, totalErrorAbsolute };
}

// --- Main ---
async function main() {
  // 1. Resolve equipment ID
  const equipment = await sb('equipment', { name: `eq.${equipmentName}`, select: 'id,name' });
  if (!equipment.length) { console.error(`Equipment "${equipmentName}" not found.`); process.exit(1); }
  const { id: equipmentId } = equipment[0];

  // 2. Resolve lot and get targetValue
  const lots = await sb('control_lots', {
    equipment_id: `eq.${equipmentId}`,
    lot_number:   `eq.${lotNumber}`,
    select:       'id,lot_number,qc_params',
  });
  if (!lots.length) { console.error(`Lot "${lotNumber}" not found for ${equipmentName}.`); process.exit(1); }
  const lot = lots[0];
  const paramConfig = lot.qc_params?.[level]?.[param];
  if (!paramConfig) { console.error(`Param "${param}" not found in level "${level}" of lot ${lotNumber}.`); process.exit(1); }
  const targetValue = parseFloat(paramConfig.mean);
  const unit        = paramConfig.unit || '';

  // 3. Fetch QC reports
  const reportParams = {
    equipment_id: `eq.${equipmentId}`,
    lot_number:   `eq.${lotNumber}`,
    level:        `eq.${level}`,
    select:       'date,values',
    order:        'date.asc',
  };
  if (startDate) reportParams.date = `gte.${startDate}T00:00:00`;
  if (endDate)   reportParams.date = reportParams.date
    ? `gte.${startDate}T00:00:00&date=lte.${endDate}T23:59:59`
    : `lte.${endDate}T23:59:59`;

  const reports = await sb('qc_reports', reportParams);
  const rawValues = reports.map(r => r.values?.[param]).filter(v => v != null);

  if (!rawValues.length) {
    console.error(`No reports found for ${param} / ${level} / lot ${lotNumber} in the given date range.`);
    process.exit(1);
  }

  // 4. Calculate
  const stats = calculateStats(rawValues);
  const et    = calculateTotalError(stats.mean, targetValue, stats.cv, stats.stdDev);

  // 5. Print results
  console.log('\n=== Bias Verification ===');
  console.log(`Equipment : ${equipmentName}`);
  console.log(`Lot       : ${lotNumber}`);
  console.log(`Level     : ${level}`);
  console.log(`Parameter : ${param} (${unit})`);
  console.log(`Date range: ${startDate || 'all'} → ${endDate || 'all'}`);
  console.log(`Reports   : ${reports.length} total, ${rawValues.length} with ${param} values`);
  console.log(`Values    : [${rawValues.join(', ')}]`);
  console.log('\n--- Lot config (targetValue) ---');
  console.log(`  mean (Valor Diana) : ${targetValue} ${unit}`);
  console.log(`  sd                 : ${paramConfig.sd} ${unit}`);
  console.log('\n--- Calculated stats ---');
  console.log(`  n      : ${stats.n}`);
  console.log(`  labMean: ${stats.mean.toFixed(4)} ${unit}`);
  console.log(`  SD     : ${stats.stdDev.toFixed(4)} ${unit}`);
  console.log(`  CV     : ${stats.cv.toFixed(2)}%`);
  console.log('\n--- Error Total (mirrors qcStats.js) ---');
  console.log(`  Bias%        = |${stats.mean.toFixed(4)} - ${targetValue}| / ${targetValue} × 100 = ${et.biasPercent.toFixed(2)}%`);
  console.log(`  RandomError% = 1.65 × ${stats.cv.toFixed(2)}%                                    = ${et.randomErrorPercent.toFixed(2)}%`);
  console.log(`  TotalError%  =                                                                      ${et.totalErrorPercent.toFixed(2)}%`);
  console.log(`  BiasAbs      = ${et.biasAbsolute.toFixed(4)} ${unit}`);
  console.log(`  TotalErrorAbs= ${et.totalErrorAbsolute.toFixed(4)} ${unit}`);
}

main().catch(err => { console.error(err); process.exit(1); });
