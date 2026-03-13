export const calculateTotalError = (labMean, targetValue, cvPercent, sd) => {
  if (targetValue === 0 || targetValue == null || labMean == null || cvPercent == null) {
    return null;
  }
  const biasPercent = (Math.abs(labMean - targetValue) / targetValue) * 100;
  const randomErrorPercent = 1.65 * cvPercent;
  const totalErrorPercent = biasPercent + randomErrorPercent;
  const biasAbsolute = Math.abs(labMean - targetValue);
  const randomErrorAbsolute = 1.65 * (sd ?? 0);
  const totalErrorAbsolute = biasAbsolute + randomErrorAbsolute;
  return { biasPercent, randomErrorPercent, totalErrorPercent, biasAbsolute, randomErrorAbsolute, totalErrorAbsolute };
};

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
