export const calculateStats = (data) => {
  const validData = data
    .filter(v => v !== 'N/A' && v !== null && v !== undefined)
    .map(v => parseFloat(v))
    .filter(v => !isNaN(v));

  const n = validData.length;
  if (n === 0) return { mean: 0, stdDev: 0, cv: 0, n: 0 };

  const mean = validData.reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(validData.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / (n > 1 ? n - 1 : 1));
  const cv = mean === 0 ? 0 : (stdDev / mean) * 100;
  return { mean, stdDev, cv, n };
};
