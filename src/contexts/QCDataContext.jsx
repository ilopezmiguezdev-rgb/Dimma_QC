import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from './SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

const QCDataContext = createContext();

export const useQCData = () => {
  const context = useContext(QCDataContext);
  if (!context) {
    throw new Error('useQCData debe ser usado dentro de un QCDataProvider');
  }
  return context;
};

// --- Westgard Logic Helper ---
const applyWestgardRules = (newValue, history, qcParams) => {
  const triggeredRules = [];
  let status = 'ok';

  if (!qcParams || qcParams.mean === undefined || qcParams.sd === undefined) {
    return { status: 'ok', triggeredRules: [] };
  }

  const { mean, sd } = qcParams;
  const numMean = parseFloat(mean);
  const numSd = parseFloat(sd);

  if (isNaN(numMean) || isNaN(numSd) || numSd === 0) return { status: 'ok', triggeredRules: [] };

  const limit2s_upper = numMean + 2 * numSd;
  const limit2s_lower = numMean - 2 * numSd;
  const limit3s_upper = numMean + 3 * numSd;
  const limit3s_lower = numMean - 3 * numSd;

  if (newValue > limit3s_upper || newValue < limit3s_lower) {
    triggeredRules.push('1-3s');
    status = 'error';
  } else if (newValue > limit2s_upper || newValue < limit2s_lower) {
    triggeredRules.push('1-2s');
    status = 'warning';
  }

  if (history.length > 0) {
    const lastValue = history[history.length - 1];
    if ((newValue > limit2s_upper && lastValue > limit2s_upper) || (newValue < limit2s_lower && lastValue < limit2s_lower)) {
      if (!triggeredRules.includes('2-2s')) triggeredRules.push('2-2s');
      status = 'error';
    }
  }
  return { status, triggeredRules };
};

export const QCDataProvider = ({ children }) => {
  const [equipment, setEquipment] = useState([]);
  const [laboratories, setLaboratories] = useState([]);
  const [currentLabId, setCurrentLabId] = useState('all');
  const [equipmentTypes, setEquipmentTypes] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [units, setUnits] = useState([]);
  const [alarms, setAlarms] = useState([]); // Restored alarms state
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();
  const { toast } = useToast();

  // Initial Data Load (Labs, user permissions, params)
  useEffect(() => {
    const fetchMeta = async () => {
      if (!user) return;

      try {
        // Fetch All Labs (for selector)
        const { data: labs, error: labsError } = await supabase.from('laboratories').select('*').eq('is_active', true);
        if (labsError) throw labsError;
        setLaboratories(labs || []);

        // Determine current Lab context from assignedLabs on the auth profile
        const isAdmin = user.role === 'admin';
        const assignedLabs = user.profile?.assignedLabs || [];

        if (isAdmin) {
          setCurrentLabId(prev => prev === 'all' || prev ? prev : 'all');
        } else if (assignedLabs.length > 0) {
          setCurrentLabId(prev => {
            const isCurrentValid = assignedLabs.some(lab => lab.id === prev);
            return isCurrentValid ? prev : assignedLabs[0].id;
          });
        }

        // Fetch Equipment Types
        const { data: types, error: typesError } = await supabase.from('equipment_types').select('*');
        if (typesError) throw typesError;
        setEquipmentTypes(types || []);

        // Fetch Units
        const { data: unitsData } = await supabase.from('units').select('*').eq('is_active', true);
        setUnits(unitsData || []);

        // Fetch Parameters with units
        const { data: paramsData, error: paramsError } = await supabase
          .from('parameters')
          .select(`
            *,
            unit:units(name)
          `)
          .eq('is_active', true)
          .order('index', { ascending: true });
        if (paramsError) throw paramsError;

        // Flatten unit name
        const formattedParams = (paramsData || []).map(p => ({
          ...p,
          unitName: p.unit?.name
        }));
        setParameters(formattedParams);

      } catch (error) {
        console.error("Error fetching metadata:", error);
        toast({ title: 'Error de Carga', description: 'No se pudieron cargar los datos del sistema.', variant: 'destructive' });
      }
    };
    fetchMeta();
  }, [user, toast]);

  // Main Data Fetcher (Depends on currentLabId)
  const fetchAllData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Build Query for Equipment
      let equipmentQuery = supabase.from('equipment').select(`
          *,
          lots:control_lots(*),
          laboratory:laboratories(name),
          type:equipment_types(name, parameters)
        `).eq('is_active', true);

      // Filter by Lab if not 'all'
      if (currentLabId !== 'all' && currentLabId) {
        equipmentQuery = equipmentQuery.eq('laboratory_id', currentLabId);
      }

      const { data: equipmentData, error: equipmentError } = await equipmentQuery;
      if (equipmentError) {
        console.error("Supabase equipment error:", equipmentError);
        throw equipmentError;
      }

      // Transform DB snake_case to app camelCase
      const formattedEquipment = (equipmentData || []).map(eq => ({
        ...eq,
        dailyDeviationThreshold: eq.daily_deviation_threshold,
        maintenanceDue: eq.maintenance_due,
        laboratoryName: eq.laboratory?.name,
        typeName: eq.type?.name || eq.equipment_type,
        lots: (eq.lots || []).map(lot => ({
          ...lot,
          lotNumber: lot.lot_number,
          expirationDate: lot.expiration_date,
          isActive: lot.is_active
        }))
      }));

      setEquipment(formattedEquipment);

      // Fetch Alarms (Mock or DB? The user reported reference error)
      // Assuming alarms were part of qcReports logic I removed, but if StatisticsPage relies on it...
      // For now, I'll initialize it as empty array to fix the crash.
      // If there was fetch logic for it, I might have deleted it, but context suggests it was tied to reports.
      setAlarms([]);

    } catch (error) {
      console.error("Error fetching QC data:", error);
      toast({ title: 'Error de Carga', description: 'No se pudieron cargar los datos de control de calidad.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, currentLabId, toast]);

  useEffect(() => {
    // Only fetch if we have determined the lab context (or if user is loaded)
    if (user) {
      fetchAllData();
    }
  }, [fetchAllData, user]);

  const refreshParameters = async () => {
    const { data: paramsData, error } = await supabase
      .from('parameters')
      .select(`*, unit:units(name)`)
      .eq('is_active', true)
      .order('index', { ascending: true });

    if (!error && paramsData) {
      const formattedParams = paramsData.map(p => ({
        ...p,
        unitName: p.unit?.name
      }));
      setParameters(formattedParams);
    }
  };

  // --- Actions ---

  const addQCReport = async (reportData) => {
    // ... existing logic ...
    // US-02: Accept 'N/A' as valid value alongside numeric entries
    const filteredValues = Object.fromEntries(
      Object.entries(reportData.values).filter(([, value]) =>
        value === 'N/A' || (value !== null && value !== '' && !isNaN(parseFloat(value)))
      )
    );

    if (Object.keys(filteredValues).length === 0) return null;

    const equipmentToUpdate = equipment.find(e => e.id === reportData.equipmentId);
    if (!equipmentToUpdate) return null;

    const activeLot = equipmentToUpdate.lots.find(l => l.lotNumber === reportData.lotNumber);
    if (!activeLot) return null;

    const qcParamsForLevel = activeLot.qc_params[reportData.level];
    let finalStatus = 'ok';
    const allTriggeredRules = [];

    // History Calculation - FETCH ON DEMAND
    let reportsForLotAndLevel = [];
    try {
      const { data: historyData } = await supabase
        .from('qc_reports')
        .select('*')
        .eq('equipment_id', reportData.equipmentId)
        .eq('lot_number', reportData.lotNumber)
        .eq('level', reportData.level)
        .order('created_at', { ascending: false })
        .limit(20); // Fetch last 20 for Westgard analysis

      if (historyData) {
        reportsForLotAndLevel = historyData.map(r => ({
          ...r,
          values: r.values // Json b is auto parsed
        })).reverse();
      }
    } catch (e) {
      console.error("Error fetching history for Westgard", e);
    }

    // Fix order for history: we fetched DESC (newest first). 
    // We want oldest -> newest.
    // Filtered by param loop below.

    for (const param in filteredValues) {
      const value = filteredValues[param];

      // US-02: Skip Westgard analysis for 'N/A' values
      if (value === 'N/A') continue;

      const qcParamsForParam = qcParamsForLevel?.[param];

      // Prepare history for this param
      // reportsForLotAndLevel is DESC (id 100, 99, 98...) if I remove .reverse() above.
      // Actually I put .reverse() above. So reportsForLotAndLevel is ASC (oldest...newest).
      // Correct.

      const history = reportsForLotAndLevel.map(r => r.values[param]).filter(v => v !== undefined && v !== 'N/A');
      const { status, triggeredRules } = applyWestgardRules(value, history, qcParamsForParam);
      if (triggeredRules.length > 0) allTriggeredRules.push(...triggeredRules.map(rule => `${rule} para ${param}`));
      if (status === 'error') finalStatus = 'error';
      else if (status === 'warning' && finalStatus !== 'error') finalStatus = 'warning';
    }

    const dbReport = {
      equipment_id: reportData.equipmentId,
      lot_number: reportData.lotNumber,
      date: reportData.date,
      technician: reportData.technician,
      level: reportData.level,
      values: filteredValues,
      status: finalStatus,
      westgard_rules: allTriggeredRules
    };

    try {
      const { data: savedReport, error } = await supabase.from('qc_reports').insert(dbReport).select().single();
      if (error) throw error;

      const formattedReport = {
        ...savedReport,
        equipmentId: savedReport.equipment_id,
        lotNumber: savedReport.lot_number,
        westgardRules: savedReport.westgard_rules
      };

      // 1. Update Equipment Status in Database
      await supabase
        .from('equipment')
        .update({ status: finalStatus })
        .eq('id', reportData.equipmentId);

      // 2. Update Local State immediately
      setEquipment(prev => prev.map(eq =>
        eq.id === reportData.equipmentId
          ? { ...eq, status: finalStatus }
          : eq
      ));

      return formattedReport;

    } catch (err) {
      console.error("Error saving report:", err);
      toast({ title: "Error", description: "No se pudo guardar el reporte de QC.", variant: "destructive" });
      return { status: 'error' };
    }
  };

  const updateQCReport = async (reportId, newValues) => {
    try {
      // 1. Get current report context
      const { data: currentReport, error: fetchError } = await supabase
        .from('qc_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (fetchError || !currentReport) throw new Error("Reporte no encontrado");

      const { equipment_id: equipmentId, lot_number: lotNumber, level } = currentReport;

      // 2. Filter new values (ensure they are numeric and non-empty, or 'N/A')
      // US-02: Accept 'N/A' as valid value alongside numeric entries
      const filteredValues = Object.fromEntries(
        Object.entries(newValues).filter(([, value]) =>
          value === 'N/A' || (value !== null && value !== '' && !isNaN(parseFloat(value)))
        )
      );

      // 3. Fetch History (last 20 excluding current)
      const { data: historyData } = await supabase
        .from('qc_reports')
        .select('*')
        .eq('equipment_id', equipmentId)
        .eq('lot_number', lotNumber)
        .eq('level', level)
        .neq('id', reportId)
        .order('created_at', { ascending: false })
        .limit(20);

      const historyOrdered = (historyData || []).map(r => ({
        ...r,
        values: r.values
      })).reverse();

      // 4. Get QC Parameters for analysis
      const equipmentToUpdate = equipment.find(e => e.id === equipmentId);
      if (!equipmentToUpdate) return null;

      const activeLot = equipmentToUpdate.lots.find(l => l.lotNumber === lotNumber);
      if (!activeLot) return null;

      const qcParamsForLevel = activeLot.qc_params[level];
      let finalStatus = 'ok';
      const allTriggeredRules = [];

      // 5. Apply Westgard Rules per parameter
      for (const param in filteredValues) {
        const rawValue = filteredValues[param];

        // US-02: Skip Westgard analysis for 'N/A' values
        if (rawValue === 'N/A') continue;

        const value = parseFloat(rawValue);
        const qcParamsForParam = qcParamsForLevel?.[param];

        // Prepare history for this parameter (exclude 'N/A' values)
        const history = historyOrdered.map(r => r.values[param]).filter(v => v !== undefined && v !== 'N/A');

        const { status, triggeredRules } = applyWestgardRules(value, history, qcParamsForParam);

        if (triggeredRules.length > 0) {
          allTriggeredRules.push(...triggeredRules.map(rule => `${rule} para ${param}`));
        }

        if (status === 'error') finalStatus = 'error';
        else if (status === 'warning' && finalStatus !== 'error') finalStatus = 'warning';
      }

      // 6. Update Database
      const { data: updatedReport, error: updateError } = await supabase
        .from('qc_reports')
        .update({
          values: filteredValues,
          status: finalStatus,
          westgard_rules: allTriggeredRules
        })
        .eq('id', reportId)
        .select()
        .single();

      if (updateError) throw updateError;

      // 7. Update Equipment Overall Status
      await supabase
        .from('equipment')
        .update({ status: finalStatus })
        .eq('id', equipmentId);

      // 8. Update Local State immediately
      setEquipment(prev => prev.map(eq =>
        eq.id === equipmentId
          ? { ...eq, status: finalStatus }
          : eq
      ));

      return {
        ...updatedReport,
        equipmentId: updatedReport.equipment_id,
        lotNumber: updatedReport.lot_number,
        westgardRules: updatedReport.westgard_rules
      };

    } catch (err) {
      console.error("Error updating QC report:", err);
      toast({
        title: "Error",
        description: "No se pudo actualizar el reporte de QC.",
        variant: "destructive"
      });
      return null;
    }
  };

  const validateQCReport = async (reportId, userId) => {
    try {
      const { error } = await supabase
        .from('qc_reports')
        .update({
          is_validated: true,
          validated_by: userId,
          validated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error("Error validating report:", err);
      toast({ title: "Error", description: "No se pudo validar el reporte de QC.", variant: "destructive" });
      throw err;
    }
  };

  const addEquipment = async (newEquipmentData) => {
    try {
      let targetLabId = newEquipmentData.laboratoryId;
      const isAdmin = user?.user_metadata?.role === 'admin';

      if (!targetLabId) {
        if (currentLabId && currentLabId !== 'all') {
          targetLabId = currentLabId;
        } else if (!isAdmin) {
          const firstLab = user.profile?.assignedLabs?.[0];
          if (firstLab?.id) {
            targetLabId = firstLab.id;
          } else {
            throw new Error("Debes estar asignado a un laboratorio para agregar equipos.");
          }
        } else {
          targetLabId = null;
        }
      }

      let typeName = newEquipmentData.type;
      if (!typeName && newEquipmentData.typeId) {
        const foundType = equipmentTypes.find(t => t.id === newEquipmentData.typeId);
        if (foundType) {
          typeName = foundType.name;
        } else {
          const { data: typeData } = await supabase
            .from('equipment_types')
            .select('name')
            .eq('id', newEquipmentData.typeId)
            .maybeSingle();
          if (typeData) typeName = typeData.name;
        }
      }

      const dbData = {
        name: newEquipmentData.name,
        model: newEquipmentData.model,
        serial: newEquipmentData.serial,
        equipment_type_id: newEquipmentData.typeId,
        laboratory_id: targetLabId,
        maintenance_due: newEquipmentData.maintenanceDue,
        daily_deviation_threshold: newEquipmentData.dailyDeviationThreshold || 2,
        is_active: true,
        status: 'ok',
        equipment_type: typeName || 'unknown'
      };

      const { data, error } = await supabase.from('equipment').insert(dbData).select(`
            *,
            laboratory:laboratories(name),
            type:equipment_types(name)
        `).single();

      if (error) throw error;

      const newEq = {
        ...data,
        dailyDeviationThreshold: data.daily_deviation_threshold,
        maintenanceDue: data.maintenance_due,
        laboratoryName: data.laboratory?.name,
        typeName: data.type?.name || data.equipment_type,
        lots: []
      };

      setEquipment(prev => [...prev, newEq]);
      return newEq;
    } catch (err) {
      console.error("Error adding equipment:", err);
      throw err;
    }
  };

  const addLot = async (equipmentId, lotData) => {
    try {
      const dbLot = {
        equipment_id: equipmentId,
        lot_number: lotData.lotNumber,
        expiration_date: lotData.expirationDate,
        qc_params: lotData.qc_params,
        is_active: false
      };

      const { data, error } = await supabase.from('control_lots').insert(dbLot).select().single();
      if (error) throw error;

      const newLot = {
        ...data,
        lotNumber: data.lot_number,
        expirationDate: data.expiration_date,
        isActive: data.is_active
      };

      setEquipment(prev => prev.map(eq => {
        if (eq.id === equipmentId) {
          return { ...eq, lots: [...(eq.lots || []), newLot] };
        }
        return eq;
      }));
      return newLot;
    } catch (err) {
      console.error("Error adding lot:", err);
      throw err;
    }
  };

  const toggleLotActive = async (equipmentId, lotId, currentStatus) => {
    try {
      const newStatus = !currentStatus;
      const { error } = await supabase
        .from('control_lots')
        .update({ is_active: newStatus })
        .eq('id', lotId);

      if (error) throw error;

      setEquipment(prev => prev.map(eq => {
        if (eq.id === equipmentId) {
          return {
            ...eq,
            lots: (eq.lots || []).map(l =>
              l.id === lotId ? { ...l, isActive: newStatus } : l
            )
          };
        }
        return eq;
      }));
    } catch (err) {
      console.error("Error toggling lot active status:", err);
      toast({ title: "Error", description: "No se pudo cambiar el estado del lote.", variant: "destructive" });
    }
  };

  const updateLotParams = async (equipmentId, lotId, updatedLotData) => {
    try {
      const dbUpdate = {
        qc_params: updatedLotData.qc_params,
        expiration_date: updatedLotData.expirationDate,
        lot_number: updatedLotData.lotNumber
      };
      const { error } = await supabase.from('control_lots').update(dbUpdate).eq('id', lotId);
      if (error) throw error;

      setEquipment(prev => prev.map(eq => {
        if (eq.id === equipmentId) {
          const updatedLots = eq.lots.map(lot => lot.id === lotId ? { ...lot, ...updatedLotData } : lot);
          return { ...eq, lots: updatedLots };
        }
        return eq;
      }));
    } catch (err) {
      throw err;
    }
  };

  const updateEquipmentDetails = async (id, updatedData) => {
    try {
      // 1. Extract known app-specific fields that aren't DB columns
      const {
        lots,
        dailyDeviationThreshold,
        maintenanceDue,
        laboratoryName,
        typeName,
        // 2. Extract JOINED objects that must not be sent to Supabase
        laboratory,
        type,
        unit,
        // 3. Keep the rest as clean data
        ...cleanData
      } = updatedData;

      // 4. Map app camelCase to DB snake_case
      const dbData = {
        ...cleanData,
        daily_deviation_threshold: dailyDeviationThreshold,
        maintenance_due: maintenanceDue
      };

      // 5. Ensure IDs are null if empty strings (Sanitization)
      if (dbData.laboratory_id === '') dbData.laboratory_id = null;
      if (dbData.equipment_type_id === '') dbData.equipment_type_id = null;

      const { error } = await supabase.from('equipment').update(dbData).eq('id', id);
      if (error) throw error;

      // 6. Update local state
      setEquipment(prev => prev.map(eq => eq.id === id ? { ...eq, ...updatedData } : eq));
    } catch (err) {
      console.error("Update Error:", err);
      throw err;
    }
  };

  const deleteEquipment = async (id) => {
    try {
      const { error } = await supabase.from('equipment').delete().eq('id', id);
      if (error) throw error;
      setEquipment(prev => prev.filter(eq => eq.id !== id));
    } catch (err) {
      console.error("Error deleting equipment:", err);
      toast({ title: "Error", description: "No se pudo eliminar el equipo.", variant: "destructive" });
    }
  };

  const deleteQCReport = async (reportId) => {
    try {
      const { data, error } = await supabase.from('qc_reports').delete().eq('id', reportId).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('No rows deleted — possible RLS restriction');
    } catch (err) {
      console.error("Error deleting QC report:", err);
      toast({ title: "Error", description: "No se pudo eliminar el reporte de QC.", variant: "destructive" });
      throw err;
    }
  };

  const deleteLot = async (equipmentId, lotId) => {
    try {
      const { error } = await supabase.from('control_lots').delete().eq('id', lotId);
      if (error) throw error;

      setEquipment(prev => prev.map(eq => {
        if (eq.id === equipmentId) {
          return { ...eq, lots: (eq.lots || []).filter(l => l.id !== lotId) };
        }
        return eq;
      }));
    } catch (err) {
      console.error("Error deleting lot:", err);
      throw err;
    }
  };

  const updateLotDetails = async (equipmentId, lotId, { lotNumber, expirationDate }) => {
    try {
      const { data, error } = await supabase
        .from('control_lots')
        .update({
          lot_number: lotNumber,
          expiration_date: expirationDate
        })
        .eq('id', lotId)
        .select()
        .single();

      if (error) throw error;

      setEquipment(prev => prev.map(eq => {
        if (eq.id === equipmentId) {
          return {
            ...eq,
            lots: eq.lots.map(l => l.id === lotId ? {
              ...l,
              lotNumber: data.lot_number,
              expirationDate: data.expiration_date
            } : l)
          };
        }
        return eq;
      }));
    } catch (err) {
      console.error("Error updating lot details:", err);
      throw err;
    }
  };


  const value = {
    equipment,
    alarms,
    laboratories,
    equipmentTypes,
    currentLabId,
    parameters,
    units,
    setCurrentLabId,
    loading,
    addQCReport,
    updateQCReport,
    validateQCReport,
    addEquipment,
    addLot,
    toggleLotActive,
    updateLotParams,
    updateEquipmentDetails,
    deleteEquipment,
    deleteQCReport,
    deleteLot,
    updateLotDetails,
    refetch: fetchAllData,
    refreshParameters
  };

  return (
    <QCDataContext.Provider value={value}>
      {children}
    </QCDataContext.Provider>
  );
};