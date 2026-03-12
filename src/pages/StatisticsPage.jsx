import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useQCData } from '@/contexts/QCDataContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Sliders, Loader2, RefreshCw, BarChart } from 'lucide-react';
import { calculateStats } from '@/utils/qcStats';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const paramName = payload[0].name;
    return (
      <div className="p-2 bg-white border rounded-lg shadow-lg">
        <p className="font-bold">{`Fecha: ${label}`}</p>
        <p className="text-sm" style={{ color: payload[0].stroke }}>{`${paramName}: ${payload[0].value}`}</p>
        {payload[0].payload.rules && <p className="text-xs text-red-500">{`Reglas: ${payload[0].payload.rules}`}</p>}
      </div>
    );
  }
  return null;
};

const StatisticsPage = () => {
  const { equipment, parameters } = useQCData();
  const { toast } = useToast();

  const [selectedEquipmentId, setSelectedEquipmentId] = useState(equipment[0]?.id || '');

  const currentEquipment = useMemo(() => equipment.find(e => e.id === selectedEquipmentId), [equipment, selectedEquipmentId]);
  const allLots = useMemo(() => currentEquipment?.lots || [], [currentEquipment]);
  const [selectedLot, setSelectedLot] = useState(null);

  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedParam, setSelectedParam] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toLocaleDateString('en-CA'),
    end: new Date().toLocaleDateString('en-CA'),
  });

  const [fetchedReports, setFetchedReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Effect to handle initial equipment selection
  useEffect(() => {
    if (!selectedEquipmentId && equipment.length > 0) {
      setSelectedEquipmentId(equipment[0].id);
    }
  }, [equipment, selectedEquipmentId]);

  const fetchReports = useCallback(async () => {
    if (!selectedEquipmentId) return;
    setLoadingReports(true);
    const start = new Date(`${dateRange.start}T00:00:00`);
    const end = new Date(`${dateRange.end}T23:59:59.999`);

    try {
      const { data, error } = await supabase
        .from('qc_reports')
        .select('*')
        .eq('equipment_id', selectedEquipmentId)
        .gte('date', start.toISOString())
        .lte('date', end.toISOString())
        .order('date', { ascending: true }); // Chart needs ascending

      if (error) throw error;

      const formattedReports = (data || []).map(r => ({
        ...r,
        equipmentId: r.equipment_id,
        lotNumber: r.lot_number,
        westgardRules: r.westgard_rules
      }));
      setFetchedReports(formattedReports);

    } catch (err) {
      console.error("Error fetching statistics reports:", err);
      toast({ title: "Error", description: "No se pudieron cargar los reportes para el rango seleccionado.", variant: "destructive" });
    } finally {
      setLoadingReports(false);
    }
  }, [selectedEquipmentId, dateRange.start, dateRange.end, toast]);

  useEffect(() => {
    const active = allLots.find(l => l.isActive) || allLots[0] || null;
    setSelectedLot(active);
  }, [allLots]);

  // Effect to fetch reports when Equipment or Date Range changes
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);


  useEffect(() => {
    if (selectedLot && selectedLot.qc_params) {
      const firstLevel = Object.keys(selectedLot.qc_params)[0];
      setSelectedLevel(firstLevel || '');
      if (firstLevel) {
        const firstParam = Object.keys(selectedLot.qc_params[firstLevel] || {})[0];
        setSelectedParam(firstParam || '');
      }
    } else {
      setSelectedLevel('');
      setSelectedParam('');
    }
  }, [selectedLot]);

  const handleEquipmentChange = (id) => {
    setSelectedEquipmentId(id);
  };

  const filteredReports = useMemo(() => {
    if (!selectedLot) return [];

    // We already filtered by date and equipment in the fetch.
    // Now we filter by LOT and LEVEL.
    return fetchedReports.filter(r =>
      r.lotNumber === selectedLot.lotNumber &&
      r.level === selectedLevel
    );
  }, [fetchedReports, selectedLevel, selectedLot]);

  const statsByParam = useMemo(() => {
    const qcParams = selectedLot?.qc_params?.[selectedLevel];
    if (!qcParams || filteredReports.length === 0) return {};

    const results = {};
    const relevantParams = parameters.filter(p => qcParams[p.name]);
    relevantParams.forEach(p => {
      const values = filteredReports.map(r => r.values[p.name]);
      results[p.name] = { ...calculateStats(values), unit: qcParams[p.name]?.unit || '' };
    });
    return results;
  }, [filteredReports, selectedLot, selectedLevel, parameters]);

  const chartData = useMemo(() => filteredReports.map(report => ({
    date: new Date(report.date).toLocaleDateString('en-CA', { day: '2-digit', month: '2-digit' }),
    value: report.values[selectedParam],
    rules: (report.westgardRules || []).filter(r => r.includes(selectedParam)).join(', ')
  })), [filteredReports, selectedParam]);

  const qcRef = useMemo(() => {
    const raw = selectedLot?.qc_params?.[selectedLevel]?.[selectedParam];
    if (!raw) return null;
    const mean = parseFloat(raw.mean);
    const sd = parseFloat(raw.sd);
    if (isNaN(mean) || isNaN(sd) || sd === 0) return null;
    return {
      mean,
      sd,
      plus1s: mean + sd,
      minus1s: mean - sd,
      plus2s: mean + 2 * sd,
      minus2s: mean - 2 * sd,
      plus3s: mean + 3 * sd,
      minus3s: mean - 3 * sd,
    };
  }, [selectedLot, selectedLevel, selectedParam]);

  const yDomain = useMemo(() => {
    if (!qcRef || chartData.length === 0) return undefined;
    let yMin = qcRef.mean - 4 * qcRef.sd;
    let yMax = qcRef.mean + 4 * qcRef.sd;
    const values = chartData.map(d => d.value).filter(v => v != null);
    if (values.length > 0) {
      const dataMin = Math.min(...values);
      const dataMax = Math.max(...values);
      yMin = Math.min(yMin, dataMin - qcRef.sd * 0.5);
      yMax = Math.max(yMax, dataMax + qcRef.sd * 0.5);
    }
    return [yMin, yMax];
  }, [qcRef, chartData]);

  return (
    <>
      <Helmet>
        <title>Estadísticas - QC LabControl</title>
        <meta name="description" content="Rendimiento de los equipos y estadísticas de control de calidad." />
      </Helmet>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Análisis de Tendencias de CC</h1>
            <p className="text-muted-foreground mt-1">Visualice y analice el rendimiento histórico de sus equipos.</p>
          </div>
          <Button onClick={fetchReports} disabled={loadingReports} variant="outline" className="w-fit">
            <RefreshCw className={`w-4 h-4 mr-2 ${loadingReports ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="medical-card rounded-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <select value={selectedEquipmentId} onChange={(e) => handleEquipmentChange(e.target.value)} className="p-2 border border-border rounded-md w-full">
              <option value="" disabled>Seleccionar Equipo</option>
              {equipment.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>

            <select
              value={selectedLot?.id || ''}
              onChange={(e) => {
                const lot = allLots.find(l => l.id === e.target.value);
                setSelectedLot(lot || null);
              }}
              className="p-2 border border-border rounded-md w-full"
              disabled={allLots.length === 0}
            >
              <option value="" disabled>Lote</option>
              {allLots.map(l => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber}{l.isActive ? ' (Activo)' : ''}
                </option>
              ))}
            </select>

            <select value={selectedLevel} onChange={(e) => setSelectedLevel(e.target.value)} className="p-2 border border-border rounded-md w-full" disabled={!selectedLot}>
              <option value="" disabled>Nivel</option>
              {selectedLot && selectedLot.qc_params && Object.keys(selectedLot.qc_params).map(level => <option key={level} value={level}>{level}</option>)}
            </select>

            <select value={selectedParam} onChange={(e) => setSelectedParam(e.target.value)} className="p-2 border border-border rounded-md w-full" disabled={!selectedLevel}>
              <option value="" disabled>Parámetro</option>
              {selectedLot && selectedLot.qc_params && selectedLot.qc_params[selectedLevel] && Object.keys(selectedLot.qc_params[selectedLevel]).map(param => <option key={param} value={param}>{param}</option>)}
            </select>

            <div className="flex items-center gap-2">
              <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="p-2 border border-border rounded-md w-full" />
              <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="p-2 border border-border rounded-md w-full" />
            </div>
          </div>

          {loadingReports ? (
            <div className="h-96 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
              <p className="text-muted-foreground">Cargando datos del gráfico...</p>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  domain={yDomain}
                  ticks={qcRef ? [qcRef.minus3s, qcRef.minus2s, qcRef.minus1s, qcRef.mean, qcRef.plus1s, qcRef.plus2s, qcRef.plus3s] : undefined}
                  allowDataOverflow={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                {qcRef && (
                  <>
                    <ReferenceLine y={qcRef.mean} label="Media" stroke="black" strokeDasharray="3 3" />
                    <ReferenceLine y={qcRef.plus1s} label="+1s" stroke="green" strokeDasharray="3 3" />
                    <ReferenceLine y={qcRef.minus1s} label="-1s" stroke="green" strokeDasharray="3 3" />
                    <ReferenceLine y={qcRef.plus2s} label="+2s" stroke="orange" strokeDasharray="3 3" />
                    <ReferenceLine y={qcRef.minus2s} label="-2s" stroke="orange" strokeDasharray="3 3" />
                    <ReferenceLine y={qcRef.plus3s} label="+3s" stroke="red" strokeDasharray="3 3" />
                    <ReferenceLine y={qcRef.minus3s} label="-3s" stroke="red" strokeDasharray="3 3" />
                  </>
                )}
                <Line type="monotone" dataKey="value" name={selectedParam} stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-96 flex flex-col items-center justify-center text-center text-muted-foreground">
              <Sliders className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold text-foreground">No hay datos para mostrar</h3>
              <p>No se encontraron reportes para los filtros seleccionados, o no hay un lote activo para el equipo.</p>
            </div>
          )}
        </motion.div>

        {Object.keys(statsByParam).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="medical-card rounded-xl p-6">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-4">
              <BarChart className="w-5 h-5" /> Resumen Estadístico
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2 px-4">Parámetro</th>
                    <th className="py-2 px-4">N</th>
                    <th className="py-2 px-4">Media (X&#772;)</th>
                    <th className="py-2 px-4">SD</th>
                    <th className="py-2 px-4">CV%</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(statsByParam)
                  .filter(([param]) => !selectedParam || param === selectedParam)
                  .map(([param, stats]) => (
                    <tr key={param} className="border-b border-border">
                      <td className="py-2 px-4 font-semibold">{param} ({stats.unit})</td>
                      <td className="py-2 px-4">{stats.n}</td>
                      <td className="py-2 px-4">{stats.n > 0 ? stats.mean.toFixed(2) : 'N/A'}</td>
                      <td className="py-2 px-4">{stats.n > 0 ? stats.stdDev.toFixed(2) : 'N/A'}</td>
                      <td className="py-2 px-4">{stats.n > 0 ? stats.cv.toFixed(2) + '%' : 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </>
  );
};

export default StatisticsPage;