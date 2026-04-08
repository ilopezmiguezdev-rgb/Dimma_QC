import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { SlidersHorizontal, CheckCircle, AlertTriangle, Wrench, Calendar, BarChart3, Loader2, Check, Clock, Eye, Pencil, Trash2 } from 'lucide-react';
import { useQCData } from '@/contexts/QCDataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import EditQCReportModal from '@/components/EditQCReportModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const Dashboard = () => {
  const { equipment, validateQCReport, deleteQCReport } = useQCData();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [reportsTodayCount, setReportsTodayCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  const [pendingReports, setPendingReports] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [reportToEdit, setReportToEdit] = useState(null);

  const role = user?.role;
  const isBiochemist = role === 'biochemist';
  const isAdmin = role === 'admin';
  const isTechnician = role === 'technician';
  const canUserValidate = isAdmin || isBiochemist;

  const getTodayString = () => new Date().toISOString().split('T')[0];

  useEffect(() => {
    const fetchTodayStats = async () => {
      if (!user) return;
      setLoadingStats(true);
      try {
        const today = getTodayString();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        const { count, error } = await supabase
          .from('qc_reports')
          .select('*', { count: 'exact', head: true })
          .gte('date', startOfDay.toISOString())
          .lte('date', endOfDay.toISOString());

        if (error) throw error;
        setReportsTodayCount(count || 0);

      } catch (err) {
        console.error("Error fetching dashboard stats:", err);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchTodayStats();
  }, [user]);

  useEffect(() => {
    const fetchPending = async () => {
      if (!user || !canUserValidate) return;
      setLoadingPending(true);
      try {
        let query = supabase
          .from('qc_reports')
          .select(`
            *,
            equipment:equipment!inner(name, model, laboratory_id)
          `)
          .eq('is_validated', false)
          .order('date', { ascending: false });

        if (isBiochemist && user.profile?.laboratory_id) {
          query = query.eq('equipment.laboratory_id', user.profile.laboratory_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        setPendingReports(data || []);
      } catch (err) {
        console.error("Error fetching pending validations:", err);
      } finally {
        setLoadingPending(false);
      }
    };

    fetchPending();
  }, [user, canUserValidate, isBiochemist]);

  const handleViewReport = (report) => {
    setSelectedReport(report);
    setIsModalOpen(true);
  };

  const handleEditReport = (report) => {
    // Enrich report with local IDs for the modal
    const eq = equipment.find(e => e.id === report.equipment_id);
    const lot = eq?.lots?.find(l => l.lotNumber === report.lot_number);

    setReportToEdit({
      ...report,
      equipmentId: report.equipment_id,
      lotNumber: report.lot_number,
      lotId: lot?.id
    });
    setIsEditModalOpen(true);
  };

  const handleDeleteReport = async (reportId) => {
    try {
      await deleteQCReport(reportId);
      setPendingReports(prev => prev.filter(r => r.id !== reportId));
      toast({ title: "Reporte Eliminado", description: "El reporte ha sido eliminado correctamente." });
    } catch {
      // error toast is shown by the context
    }
  };

  const handleValidate = async (reportId) => {
    try {
      await validateQCReport(reportId, user.id);
      setPendingReports(prev => prev.filter(r => r.id !== reportId));
      setIsModalOpen(false);
      toast({ title: "Control Validado", description: "El reporte ha sido validado correctamente." });
    } catch (err) {
      console.error("Error validating report:", err);
    }
  };

  const stats = {
    totalEquipment: equipment.length,
    okEquipment: equipment.filter(e => e.status === 'ok').length,
    warningEquipment: equipment.filter(e => e.status === 'warning').length,
    errorEquipment: equipment.filter(e => e.status === 'error').length,
    maintenanceDue: equipment.filter(e => new Date(e.maintenanceDue) < new Date()).length,
    reportsToday: reportsTodayCount,
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '¡Buenos días';
    if (hour < 18) return '¡Buenas tardes';
    return '¡Buenas noches';
  };

  const StatCard = ({ icon: Icon, title, value, subtitle, color, onClick }) => (
    <div
      onClick={onClick}
      className={`medical-card rounded-xl p-6 hover:shadow-lg transition-all duration-300 ${onClick ? 'cursor-pointer hover:scale-105' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
          {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
        </div>
        <div className={`w-12 h-12 bg-${color}-100 rounded-lg flex items-center justify-center`}>
          <Icon className={`w-6 h-6 text-${color}-600`} />
        </div>
      </div>
    </div>
  );

  const equipmentWithIssues = equipment.filter(e => e.status === 'error' || e.status === 'warning');

  const displayUserName = user?.profile?.full_name || user?.user_metadata?.full_name || user?.email || 'User';

  return (
    <>
      <Helmet>
        <title>Dashboard - DIMMA QC</title>
        <meta name="description" content="Main dashboard for laboratory equipment quality control management." />
      </Helmet>

      <div className="space-y-6">
        <div
          className="medical-card rounded-xl p-6"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {getGreeting()}, {displayUserName}! 👋
              </h1>
              <p className="text-muted-foreground mt-1">
                Resumen del estado de control de calidad hoy.
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex items-center space-x-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{new Date().toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            icon={SlidersHorizontal}
            title="Equipos Monitoreados"
            value={stats.totalEquipment}
            subtitle="Total de equipos"
            color="teal"
            onClick={() => navigate('/equipment')}
          />
          <StatCard
            icon={CheckCircle}
            title="Equipos OK"
            value={stats.okEquipment}
            subtitle="Operando en rango"
            color="green"
            onClick={() => navigate('/equipment?status=ok')}
          />
          <StatCard
            icon={AlertTriangle}
            title="Equipos con Alertas"
            value={stats.warningEquipment + stats.errorEquipment}
            subtitle="Requieren atención"
            color="orange"
            onClick={() => navigate('/equipment?status=issue')}
          />
          {!isTechnician && (
            <StatCard
              icon={Wrench}
              title="Mantenimiento"
              value={stats.maintenanceDue}
              subtitle="Servicios vencidos"
              color="red"
              onClick={() => navigate('/equipment?status=maintenance')}
            />
          )}
        </div>

        {canUserValidate && (
          <div className="medical-card rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-500" />
                Validaciones Pendientes
              </h2>
              <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-bold">
                {pendingReports.length} reportes
              </span>
            </div>

            {loadingPending ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : pendingReports.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Equipo</TableHead>
                      <TableHead>Fecha/Hora</TableHead>
                      <TableHead>Nivel</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingReports.map((report) => (
                      <TableRow
                        key={report.id}
                        className="cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => handleViewReport(report)}
                      >
                        <TableCell className="font-semibold text-foreground">
                          {report.equipment?.name}
                          <p className="text-xs text-muted-foreground font-normal">{report.equipment?.model}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(report.date).toLocaleString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </TableCell>
                        <TableCell>
                          <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 font-medium">
                            Nivel {report.level}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${report.status === 'ok' ? 'bg-green-100 text-green-700' :
                            report.status === 'warning' ? 'bg-orange-100 text-orange-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                            {report.status.toUpperCase()}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewReport(report);
                              }}
                              className="h-8 w-8 text-muted-foreground"
                              title="Ver detalles"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditReport(report);
                              }}
                              className="h-8 w-8 text-blue-600"
                              title="Corregir/Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-8 w-8 text-red-500"
                                  title="Eliminar reporte"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Eliminar reporte?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta acción no se puede deshacer. El reporte de control será eliminado permanentemente.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleDeleteReport(report.id)}
                                  >
                                    Eliminar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleValidate(report.id);
                              }}
                              disabled={report.status !== 'ok'}
                              className={`h-8 medical-gradient text-white flex items-center justify-center ${report.status !== 'ok' ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title={report.status !== 'ok' ? "Corrija los valores antes de validar" : "Validar Control"}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              <span className="text-xs">Validar</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50/30 rounded-lg border border-dashed">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2 opacity-50" />
                <p className="text-muted-foreground">No hay validaciones pendientes.</p>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div
            className="lg:col-span-2 medical-card rounded-xl p-6"
          >
            <h2 className="text-xl font-bold text-foreground mb-4">Equipos con Problemas</h2>
            {equipmentWithIssues.length > 0 ? (
              <div className="space-y-4">
                {equipmentWithIssues.map(eq => (
                  <div key={eq.id} className={`p-3 rounded-lg flex items-center justify-between border-l-4 ${eq.status === 'error' ? 'bg-red-50 border-red-500' : 'bg-yellow-50 border-yellow-500'}`}>
                    <div>
                      <p className="font-semibold text-gray-800">{eq.name}</p>
                      <p className="text-sm text-gray-500">{eq.model}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`font-bold text-sm ${eq.status === 'error' ? 'text-red-600' : 'text-yellow-600'}`}>
                        {eq.status === 'error' ? 'ERROR' : 'ADVERTENCIA'}
                      </span>
                      <button onClick={() => navigate(`/equipment/${eq.id}`)} className="bg-white text-black text-sm py-1 px-3 rounded-md border">Ver Detalles</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                <p className="font-semibold text-gray-700">¡Todos los sistemas normales!</p>
                <p className="text-sm text-gray-500">No hay equipos con advertencias o errores.</p>
              </div>
            )}
          </div>

          <div
            className="medical-card rounded-xl p-6 flex flex-col justify-between"
          >
            <div>
              <h2 className="text-xl font-bold text-foreground mb-2">Reportes de Hoy</h2>
              {loadingStats ? (
                <div className="h-12 flex items-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : (
                <p className="text-5xl font-bold text-primary">{stats.reportsToday}</p>
              )}
              <p className="text-muted-foreground">Controles de calidad enviados.</p>
            </div>
            <button onClick={() => navigate('/statistics')} className="bg-primary text-white w-full mt-4 py-2 px-4 rounded-md flex items-center justify-center">
              <BarChart3 className="w-4 h-4 mr-2" />
              Ver Estadísticas
            </button>
          </div>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Detalles del Reporte</DialogTitle>
            <DialogDescription>
              Valores del control para {selectedReport?.equipment?.name} (Nivel {selectedReport?.level})
            </DialogDescription>
          </DialogHeader>

          {selectedReport && (
            <div className="py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parámetro</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(selectedReport.values).map(([param, value]) => (
                    <TableRow key={param}>
                      <TableCell className="font-medium">{param}</TableCell>
                      <TableCell className="text-right">
                        {value === 'N/A' || value === null || value === undefined
                          ? 'N/A'
                          : typeof value === 'number'
                            ? value.toFixed(2)
                            : value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {selectedReport.westgard_rules?.length > 0 && (
                <div className="mt-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-xs font-bold text-orange-800 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Reglas Westgard Violadas:
                  </p>
                  <ul className="text-xs text-orange-700 list-disc list-inside">
                    {selectedReport.westgard_rules.map((rule, idx) => (
                      <li key={idx}>{rule}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              Cancelar
            </button>
            <button
              onClick={() => handleValidate(selectedReport.id)}
              disabled={selectedReport?.status !== 'ok'}
              className={`px-4 py-2 text-sm font-medium text-white bg-primary border border-transparent rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary flex items-center gap-2 ${selectedReport?.status !== 'ok' ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={selectedReport?.status !== 'ok' ? "Corrija los valores antes de validar" : ""}
            >
              <Check className="w-4 h-4" />
              Validar Reporte
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditQCReportModal
        report={reportToEdit}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setReportToEdit(null);
          // Refresh pending reports after edit
          const fetchPending = async () => {
            let query = supabase
              .from('qc_reports')
              .select(`
                *,
                equipment:equipment!inner(name, model, laboratory_id)
              `)
              .eq('is_validated', false)
              .order('date', { ascending: false });

            if (isBiochemist && user.profile?.laboratory_id) {
              query = query.eq('equipment.laboratory_id', user.profile.laboratory_id);
            }

            const { data } = await query;
            setPendingReports(data || []);
          };
          fetchPending();
        }}
        qcParams={
          reportToEdit && equipment.find(e => e.id === reportToEdit.equipment_id)
            ?.lots?.find(l => l.lotNumber === reportToEdit.lot_number)
            ?.qc_params?.[reportToEdit.level]
        }
      />
    </>
  );
};

export default Dashboard;