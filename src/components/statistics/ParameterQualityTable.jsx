import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { FileDown, ShieldCheck } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ParameterQualityTable = ({ statsByParam, context }) => {
  const [showOnlyRed, setShowOnlyRed] = useState(false);

  const paramsWithET = Object.entries(statsByParam).filter(([, s]) => s.etStatus != null);
  const alertParams = paramsWithET.filter(([, s]) => s.etStatus === 'red');
  const hasAlerts = alertParams.length > 0;

  const displayParams = showOnlyRed
    ? paramsWithET.filter(([, s]) => s.etStatus === 'red')
    : paramsWithET;

  if (paramsWithET.length === 0) return null;

  const handleExportPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text('Detalle de Error Total', 14, 20);
    doc.setFontSize(10);
    doc.text(`Equipo: ${context.equipmentName}`, 14, 28);
    doc.text(`Lote: ${context.lotNumber} | Nivel: ${context.level}`, 14, 34);
    doc.text(`Período: ${context.dateRange.start} — ${context.dateRange.end}`, 14, 40);

    autoTable(doc, {
      startY: 48,
      head: [['Parámetro', 'Valor Diana', 'Sesgo%', 'Error Aleat.', 'Error Total', 'Meta EFLM', 'Meta CLIA', 'Estado']],
      body: displayParams.map(([param, s]) => {
        const isAbsolute = s.metaCliaType === 'absolute';
        const etDisplay = s.et
          ? isAbsolute
            ? s.et.totalErrorAbsolute.toFixed(2) + ' ' + s.unit
            : s.et.totalErrorPercent.toFixed(2) + '%'
          : 'N/A';
        const cliaDisplay = s.metaClia != null
          ? s.metaClia + (isAbsolute ? ' ' + s.unit : '%')
          : '—';
        const statusLabel = s.etStatus === 'green' ? 'Cumple'
          : s.etStatus === 'yellow' ? 'No cumple una meta' : 'No cumple ambas metas';

        return [
          param,
          !isNaN(s.targetValue) ? s.targetValue.toFixed(2) : 'N/A',
          s.et ? s.et.biasPercent.toFixed(2) + '%' : 'N/A',
          s.et ? s.et.randomErrorPercent.toFixed(2) + '%' : 'N/A',
          etDisplay,
          s.metaEflm != null ? s.metaEflm + '%' : '—',
          cliaDisplay,
          statusLabel,
        ];
      }),
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 7) {
          const val = data.cell.raw;
          if (val === 'Cumple') data.cell.styles.textColor = [34, 139, 34];
          else if (val === 'No cumple una meta') data.cell.styles.textColor = [204, 163, 0];
          else if (val === 'No cumple ambas metas') data.cell.styles.textColor = [220, 38, 38];
        }
      },
    });

    doc.save(`error-total-${context.equipmentName}-${context.lotNumber}-${context.level}.pdf`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="medical-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" /> Detalle de Error Total
        </h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <span>Solo alertas</span>
            <button
              type="button"
              role="switch"
              aria-checked={showOnlyRed}
              onClick={() => setShowOnlyRed(prev => !prev)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                showOnlyRed ? 'bg-red-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  showOnlyRed ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </label>
          <Button onClick={handleExportPDF} variant="outline" size="sm">
            <FileDown className="w-4 h-4 mr-2" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {hasAlerts && (
        <div className="mb-4 p-3 rounded-lg border border-yellow-400 bg-yellow-50 text-yellow-800 font-semibold text-sm">
          ⚠ {alertParams.length} parámetro(s) fuera de meta de calidad
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground text-xs uppercase">
              <th className="py-1 px-2">Parámetro</th>
              <th className="py-1 px-2">Valor Diana</th>
              <th className="py-1 px-2">Sesgo%</th>
              <th className="py-1 px-2">Error Aleat.</th>
              <th className="py-1 px-2">Error Total</th>
              <th className="py-1 px-2">Meta EFLM</th>
              <th className="py-1 px-2">Meta CLIA</th>
              <th className="py-1 px-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {displayParams.map(([param, s]) => {
              const isAbsolute = s.metaCliaType === 'absolute';
              const etDisplay = s.et
                ? isAbsolute
                  ? s.et.totalErrorAbsolute.toFixed(2) + ' ' + s.unit
                  : s.et.totalErrorPercent.toFixed(2) + '%'
                : 'N/A';
              const cliaDisplay = s.metaClia != null
                ? s.metaClia + (isAbsolute ? ' ' + s.unit : '%')
                : '—';
              return (
                <tr key={param} className="border-t border-border">
                  <td className="py-1 px-2 font-medium">{param}</td>
                  <td className="py-1 px-2">{!isNaN(s.targetValue) ? s.targetValue.toFixed(2) : 'N/A'}</td>
                  <td className="py-1 px-2">{s.et ? s.et.biasPercent.toFixed(2) + '%' : 'N/A'}</td>
                  <td className="py-1 px-2">{s.et ? s.et.randomErrorPercent.toFixed(2) + '%' : 'N/A'}</td>
                  <td className="py-1 px-2 font-bold">{etDisplay}</td>
                  <td className="py-1 px-2">{s.metaEflm != null ? s.metaEflm + '%' : '—'}</td>
                  <td className="py-1 px-2">{cliaDisplay}</td>
                  <td className="py-1 px-2">
                    <span className={`inline-block w-3 h-3 rounded-full ${
                      s.etStatus === 'green' ? 'bg-green-500' :
                      s.etStatus === 'yellow' ? 'bg-yellow-400' : 'bg-red-500'
                    }`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};

export default ParameterQualityTable;
