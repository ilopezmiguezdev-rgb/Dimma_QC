import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { useQCData } from '@/contexts/QCDataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient'; // Included import
import { hasPermission } from '@/utils/permissions';
import { calculateStats } from '@/utils/qcStats';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { CheckCircle, AlertTriangle, Wrench, Save, Edit, Pencil, BarChart, ChevronDown, ChevronUp, PackagePlus, Trash2, Loader2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import EditQCReportModal from '@/components/EditQCReportModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


const StatsTable = ({ reports, qcParams, parameters, selectedParam }) => {
  const [isOpen, setIsOpen] = useState(true);
  const statsByParam = useMemo(() => {
    if (!qcParams) return {};
    const results = {};
    const relevantParams = parameters.filter(p => qcParams[p.name]);
    relevantParams.forEach(p => {
      const param = p.name;
      const values = reports.map(r => r.values[param]);
      results[param] = calculateStats(values);
    });
    return results;
  }, [reports, qcParams, parameters]);

  if (!qcParams) return null;

  return (
    <div className="medical-card rounded-xl p-6">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2"><BarChart /> Resumen Estadístico del Lote</h2>
        {isOpen ? <ChevronUp /> : <ChevronDown />}
      </button>
      {isOpen && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary text-muted-foreground uppercase">
              <tr>
                <th className="py-2 px-4">Parámetro</th>
                <th className="py-2 px-4">N</th>
                <th className="py-2 px-4">Media (X̄)</th>
                <th className="py-2 px-4">SD</th>
                <th className="py-2 px-4">CV%</th>
              </tr>
            </thead>
            <tbody>
              {parameters.filter(p => qcParams[p.name] && (!selectedParam || p.name === selectedParam)).map(p => {
                const param = p.name;
                const stats = statsByParam[param];
                if (!stats) return null;
                return (
                  <tr key={param} className="border-b border-border">
                    <td className="py-2 px-4 font-semibold">{param} ({qcParams[param]?.unit || ''})</td>
                    <td className="py-2 px-4">{stats.n}</td>
                    <td className="py-2 px-4">{stats.n > 0 ? stats.mean.toFixed(2) : 'N/A'}</td>
                    <td className="py-2 px-4">{stats.n > 0 ? stats.stdDev.toFixed(2) : 'N/A'}</td>
                    <td className="py-2 px-4">{stats.n > 0 ? stats.cv.toFixed(2) + '%' : 'N/A'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const EquipmentDetailPage = () => {
  const { equipmentId } = useParams();
  const { equipment, addQCReport, updateEquipmentDetails, deleteEquipment, parameters, loading: contextLoading } = useQCData();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const currentEquipment = useMemo(() => equipment.find(e => e.id === equipmentId), [equipment, equipmentId]);
  const activeLots = useMemo(() => currentEquipment?.lots?.filter(l => l.isActive) || [], [currentEquipment]);

  const [selectedLotId, setSelectedLotId] = useState('');
  const [reports, setReports] = useState([]); // Local state for reports
  const [loadingReports, setLoadingReports] = useState(true);

  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedParam, setSelectedParam] = useState('');
  const [inputValues, setInputValues] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editableEquipment, setEditableEquipment] = useState(null);
  const [editingReport, setEditingReport] = useState(null);
  const [dailyDeviationThreshold, setDailyDeviationThreshold] = useState(2);
  const [isProcessing, setIsProcessing] = useState(false);

  const activeLot = useMemo(() => activeLots.find(l => l.id === selectedLotId), [activeLots, selectedLotId]);

  // Fetch Reports Effect
  useEffect(() => {
    const fetchReports = async () => {
      if (!equipmentId) return;
      setLoadingReports(true);
      try {
        const { data, error } = await supabase
          .from('qc_reports')
          .select('*')
          .eq('equipment_id', equipmentId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        const formattedReports = (data || []).map(r => ({
          ...r,
          equipmentId: r.equipment_id,
          lotNumber: r.lot_number,
          westgardRules: r.westgard_rules
        }));
        setReports(formattedReports);
      } catch (err) {
        console.error("Error fetching local reports:", err);
        toast({ title: 'Error', description: 'No se pudieron cargar los reportes.', variant: 'destructive' });
      } finally {
        setLoadingReports(false);
      }
    };

    fetchReports();
  }, [equipmentId, toast]);

  // Auto-select the most recently created active lot
  useEffect(() => {
    if (activeLots.length > 0) {
      // Sort by created_at descending and pick the most recent
      const defaultLot = activeLots.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      setSelectedLotId(defaultLot.id);
    } else {
      setSelectedLotId('');
    }
  }, [activeLots]);

  useEffect(() => {
    if (activeLot && activeLot.qc_params) {
      const firstLevel = Object.keys(activeLot.qc_params)[0];
      setSelectedLevel(firstLevel || '');
      if (firstLevel && activeLot.qc_params[firstLevel]) {
        const firstParam = Object.keys(activeLot.qc_params[firstLevel])[0];
        setSelectedParam(firstParam || '');
      } else {
        setSelectedParam('');
      }
    } else {
      setSelectedLevel('');
      setSelectedParam('');
    }
    if (currentEquipment) {
      setEditableEquipment(JSON.parse(JSON.stringify(currentEquipment)));
      setDailyDeviationThreshold(currentEquipment.dailyDeviationThreshold || 2);
    }
  }, [activeLot, currentEquipment]);

  const getQcParamsForReport = (report) => {
    if (!report) return {};
    const equipmentForReport = equipment.find(e => e.id === report.equipmentId);
    if (!equipmentForReport || !equipmentForReport.lots) return {};
    const lotForReport = equipmentForReport.lots.find(l => l.lotNumber === report.lotNumber);
    return lotForReport?.qc_params?.[report.level] || {};
  };

  if (contextLoading) return <div className="text-center p-10"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" /></div>;

  if (!currentEquipment) {
    return <div className="text-center p-10">Equipo no encontrado. Es posible que haya sido eliminado.</div>;
  }

  const equipmentReports = reports
    .filter(r =>
      r.equipmentId === equipmentId &&
      activeLot && r.lotNumber === activeLot.lotNumber &&
      new Date(r.date) <= new Date(activeLot.expirationDate) &&
      r.level === selectedLevel
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const handleLevelChange = (level) => {
    setSelectedLevel(level);
    if (activeLot && activeLot.qc_params && activeLot.qc_params[level]) {
      const firstParam = Object.keys(activeLot.qc_params[level])[0];
      setSelectedParam(firstParam || '');
    } else {
      setSelectedParam('');
    }
    setInputValues({});
  };

  const handleInputChange = (param, value) => {
    setInputValues(prev => ({ ...prev, [param]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    const report = {
      equipmentId,
      lotNumber: activeLot.lotNumber,
      date: new Date().toISOString(),
      technician: user?.user_metadata?.full_name || 'Usuario',
      level: selectedLevel,
      values: Object.fromEntries(Object.entries(inputValues).map(([k, v]) => [k, parseFloat(v)])),
      dailyDeviationThreshold: dailyDeviationThreshold,
    };

    try {
      const newReport = await addQCReport(report);
      if (newReport) {
        toast({
          title: "Reporte QC Guardado",
          description: `El control para ${currentEquipment.name} ha sido registrado.`,
          variant: newReport.status === 'error' ? 'destructive' : 'default',
        });
        setInputValues({});
        setReports(prev => [newReport, ...prev]); // Update local state
      }
    } catch (err) {
      console.error("Error saving report:", err);
      toast({ title: 'Error', description: 'Error al guardar reporte.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveDetails = async () => {
    setIsProcessing(true);
    try {
      await updateEquipmentDetails(equipmentId, editableEquipment);
      setIsEditing(false);
      toast({ title: "Detalles Guardados", description: "La información del equipo ha sido actualizada." });
    } catch (err) {
      console.error("Error updating details:", err);
      toast({ title: 'Error', description: 'Error al actualizar detalles.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteEquipment = async () => {
    setIsProcessing(true);
    try {
      await deleteEquipment(equipmentId);
      toast({ title: "Equipo Eliminado", description: `${currentEquipment.name} ha sido eliminado.` });
      navigate('/equipment');
    } catch (err) {
      console.error("Error deleting equipment:", err);
      toast({ title: 'Error', description: 'Error al eliminar el equipo.', variant: 'destructive' });
      setIsProcessing(false);
    }
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'ok': return { text: 'OK', icon: CheckCircle, color: 'text-green-600' };
      case 'warning': return { text: 'Advertencia', icon: AlertTriangle, color: 'text-yellow-600' };
      case 'error': return { text: 'Error', icon: AlertTriangle, color: 'text-red-600' };
      default: return { text: 'Desconocido', icon: Wrench, color: 'text-gray-600' };
    }
  };
  const statusInfo = getStatusInfo(currentEquipment.status);
  const StatusIcon = statusInfo.icon;

  const chartData = equipmentReports
    .map(report => ({
      date: new Date(report.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
      value: report.values[selectedParam],
      rules: (report.westgardRules || []).filter(r => r.includes(selectedParam)).join(', ')
    }))
    .filter(entry => entry.value !== 'N/A' && entry.value !== null && entry.value !== undefined);

  const qcParamsForChart = activeLot?.qc_params?.[selectedLevel]?.[selectedParam];
  const qcRef = (() => {
    if (!qcParamsForChart) return null;
    const mean = parseFloat(qcParamsForChart.mean);
    const sd = parseFloat(qcParamsForChart.sd);
    if (isNaN(mean) || isNaN(sd) || sd === 0) return null;
    return {
      mean,
      sd,
      plus2s: mean + 2 * sd,
      minus2s: mean - 2 * sd,
      plus3s: mean + 3 * sd,
      minus3s: mean - 3 * sd,
    };
  })();
  const yDomain = (() => {
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
  })();
  const canSubmit = selectedLevel && activeLot?.qc_params?.[selectedLevel] && Object.keys(activeLot.qc_params[selectedLevel] || {}).length > 0 && Object.keys(activeLot.qc_params[selectedLevel]).every(param => inputValues[param]);
  const yAxisLabel = qcParamsForChart?.unit ? { value: qcParamsForChart.unit, angle: -90, position: 'insideLeft', offset: 10 } : null;
  const canDeleteEquipment = hasPermission(user, 'delete_equipment');
  const isAdmin = user?.user_metadata?.role === 'admin';

  return (
    <>
      <Helmet>
        <title>{currentEquipment.name} - DIMMA QC</title>
      </Helmet>
      <div className="space-y-6">
        <div className="medical-card rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{currentEquipment.name}</h1>
              <p className="text-muted-foreground">{currentEquipment.model} (S/N: {currentEquipment.serial})</p>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <div className={`flex items-center gap-2 font-semibold ${statusInfo.color}`}>
                  <StatusIcon className="w-5 h-5" />
                  <span>Estado: {statusInfo.text}</span>
                </div>
                {activeLots.length > 0 ? (
                  activeLots.length === 1 ? (
                    <div className="text-sm text-muted-foreground bg-secondary px-2 py-1 rounded-md">
                      Lote Activo: <span className="font-bold text-foreground">{activeLots[0].lotNumber}</span> (Expira: {new Date(activeLots[0].expirationDate).toLocaleDateString('es-ES')})
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">{activeLots.length} Lotes Activos:</label>
                      <select
                        value={selectedLotId}
                        onChange={(e) => setSelectedLotId(e.target.value)}
                        className="p-2 border border-border rounded-md text-sm bg-white"
                      >
                        {activeLots.map(lot => (
                          <option key={lot.id} value={lot.id}>
                            {lot.lotNumber} (Expira: {new Date(lot.expirationDate).toLocaleDateString('es-ES')})
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                ) : (
                  <div className="text-sm text-red-600 bg-red-100 px-2 py-1 rounded-md">
                    Sin lote activo.
                  </div>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-2 mt-4 md:mt-0">
                <Button onClick={() => setIsEditing(!isEditing)} variant="outline" disabled={isProcessing}>
                  {isEditing ? 'Cancelar' : <><Edit className="w-4 h-4 mr-2" /> Editar Equipo</>}
                </Button>
                {canDeleteEquipment && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={isProcessing}>
                        <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta acción no se puede deshacer. Esto eliminará permanentemente el equipo
                          y todos los datos asociados, incluidos los reportes de control de calidad.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteEquipment}>
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </div>
          {isEditing && editableEquipment && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input type="text" placeholder="Nombre del Equipo" value={editableEquipment.name} onChange={e => setEditableEquipment({ ...editableEquipment, name: e.target.value })} className="p-2 border rounded" disabled={isProcessing} />
                <input type="text" placeholder="Modelo" value={editableEquipment.model} onChange={e => setEditableEquipment({ ...editableEquipment, model: e.target.value })} className="p-2 border rounded" disabled={isProcessing} />
                <input type="text" placeholder="Número de Serie" value={editableEquipment.serial} onChange={e => setEditableEquipment({ ...editableEquipment, serial: e.target.value })} className="p-2 border rounded" disabled={isProcessing} />
              </div>
              <Button onClick={handleSaveDetails} className="mt-4 medical-gradient text-white" disabled={isProcessing}>
                {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar
              </Button>
            </div>
          )}
        </div>

        {activeLots.length === 0 && (
          <div className="medical-card rounded-xl p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground">Sin Lote Activo</h2>
            <p className="text-muted-foreground mt-2">Para cargar controles o ver estadísticas, primero debe activar un lote para este equipo.</p>
            {isAdmin && (
              <Button onClick={() => navigate('/settings')} className="mt-4 medical-gradient text-white">
                <PackagePlus className="w-4 h-4 mr-2" /> Gestionar Lotes
              </Button>
            )}
          </div>
        )}

        {activeLot && selectedLotId && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 medical-card rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4">
                  <h2 className="text-xl font-bold text-foreground">Gráfico Levey-Jennings</h2>
                  <div className="flex gap-2 mt-2 sm:mt-0">
                    <select value={selectedLevel} onChange={(e) => handleLevelChange(e.target.value)} className="p-2 border border-border rounded-md text-sm">
                      <option value="" disabled>Nivel</option>
                      {activeLot.qc_params && Object.keys(activeLot.qc_params).map(level => <option key={level} value={level}>{level}</option>)}
                    </select>
                    <select value={selectedParam} onChange={(e) => setSelectedParam(e.target.value)} className="p-2 border border-border rounded-md text-sm" disabled={!selectedLevel}>
                      <option value="" disabled>Parámetro</option>
                      {selectedLevel && activeLot.qc_params[selectedLevel] && Object.keys(activeLot.qc_params[selectedLevel] || {}).map(param => <option key={param} value={param}>{param}</option>)}
                    </select>
                  </div>
                </div>
                {selectedParam ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis
                        domain={yDomain}
                        ticks={qcRef ? [qcRef.minus3s, qcRef.minus2s, qcRef.mean, qcRef.plus2s, qcRef.plus3s] : undefined}
                        label={yAxisLabel}
                        allowDataOverflow={false}
                      />
                      <Tooltip />
                      <Legend />
                      {qcRef && (
                        <>
                          <ReferenceLine y={qcRef.mean} label="Media" stroke="black" strokeDasharray="3 3" />
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
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">Seleccione un parámetro para ver el gráfico.</div>
                )}
              </div>

              <div className="medical-card rounded-xl p-6">
                <h2 className="text-xl font-bold text-foreground mb-4">Cargar Control Diario</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nivel de Control</label>
                    <div className="flex flex-wrap gap-2">
                      {activeLot.qc_params && Object.keys(activeLot.qc_params).map(level => (
                        <Button key={level} type="button" variant={selectedLevel === level ? 'default' : 'outline'} onClick={() => handleLevelChange(level)}>{level}</Button>
                      ))}
                    </div>
                  </div>
                  {selectedLevel && activeLot.qc_params[selectedLevel] && Object.keys(activeLot.qc_params[selectedLevel]).length > 0 ? (
                    <div className="space-y-3 pt-2">
                      {parameters.filter(p => activeLot.qc_params[selectedLevel]?.[p.name]).map(p => {
                        const param = p.name;
                        const { mean, sd, unit } = activeLot.qc_params[selectedLevel][param];
                        const numMean = parseFloat(mean);
                        const numSd = parseFloat(sd);
                        return (
                          <div key={param}>
                            <label className="block text-sm font-medium text-gray-700">{param} ({unit})</label>
                            <p className="text-xs text-muted-foreground">
                              Rango (2s): {(!isNaN(numMean) && !isNaN(numSd)) ? `${(numMean - 2 * numSd).toFixed(2)} - ${(numMean + 2 * numSd).toFixed(2)}` : 'N/A'}
                            </p>
                            <input type="number" step="any" required value={inputValues[param] || ''} onChange={(e) => handleInputChange(param, e.target.value)} className="mt-1 w-full p-2 border border-border rounded-md" placeholder={`Valor para ${param}`} disabled={isProcessing} />
                          </div>
                        );
                      })}
                    </div>
                  ) : selectedLevel && (
                    <div className="text-center text-muted-foreground py-4">No hay parámetros definidos para este nivel.</div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Umbral de Alerta Diaria (SD)</label>
                    <select value={dailyDeviationThreshold} onChange={(e) => setDailyDeviationThreshold(parseFloat(e.target.value))} className="mt-1 p-2 border border-border rounded-md w-full" disabled={isProcessing}>
                      <option value={1}>1</option>
                      <option value={1.5}>1.5</option>
                      <option value={2}>2</option>
                      <option value={2.5}>2.5</option>
                    </select>
                  </div>
                  <Button type="submit" disabled={!canSubmit || isProcessing} className="w-full medical-gradient text-white">
                    {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Guardar Control
                  </Button>
                </form>
              </div>
            </div>

            {selectedLevel && activeLot.qc_params[selectedLevel] && <StatsTable reports={equipmentReports} qcParams={activeLot.qc_params[selectedLevel]} parameters={parameters} selectedParam={selectedParam} />}

            <div className="medical-card rounded-xl p-6">
              <h2 className="text-xl font-bold text-foreground mb-4">Historial de Controles (Lote Actual)</h2>
              {loadingReports ? <p>Cargando reportes...</p> : (
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-secondary text-muted-foreground uppercase sticky top-0">
                      <tr>
                        <th className="py-2 px-4">Fecha</th>
                        <th className="py-2 px-4">Técnico</th>
                        <th className="py-2 px-4">Nivel</th>
                        <th className="py-2 px-4">Estado</th>
                        <th className="py-2 px-4">Etapa</th>
                        <th className="py-2 px-4">Reglas Westgard</th>
                        {isAdmin && <th className="py-2 px-4">Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {reports
                        .filter(r => r.equipmentId === equipmentId && r.lotNumber === activeLot.lotNumber)
                        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                        .map(report => (
                          <tr key={report.id} className="border-b border-border hover:bg-secondary/50">
                            <td className="py-2 px-4">{new Date(report.date).toLocaleString()}</td>
                            <td className="py-2 px-4">{report.technician}</td>
                            <td className="py-2 px-4">{report.level}</td>
                            <td className={`py-2 px-4 font-semibold ${getStatusInfo(report.status).color}`}>{getStatusInfo(report.status).text.toUpperCase()}</td>
                            <td className="py-2 px-4">
                              {report.is_validated === true ? (
                                <Badge variant="success" className="bg-green-100 text-green-700 hover:bg-green-100">Validado</Badge>
                              ) : (
                                <Badge variant="warning" className="bg-orange-100 text-orange-700 hover:bg-orange-100">Pendiente de Validación</Badge>
                              )}
                            </td>
                            <td className="py-2 px-4 text-red-600">{(report.westgardRules || []).join(', ')}</td>
                            {isAdmin && (
                              <td className="py-2 px-4">
                                <Button variant="ghost" size="icon" onClick={() => setEditingReport(report)}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div >
      {editingReport && (
        <EditQCReportModal
          report={editingReport}
          isOpen={!!editingReport}
          onClose={() => setEditingReport(null)}
          qcParams={getQcParamsForReport(editingReport)}
        />
      )
      }
    </>
  );
};

export default EquipmentDetailPage;