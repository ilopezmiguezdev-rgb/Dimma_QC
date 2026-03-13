import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useQCData } from '@/contexts/QCDataContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';

const ParameterGoalsTab = () => {
  const { parameters, refreshParameters } = useQCData();
  const { toast } = useToast();
  const [goals, setGoals] = useState({});
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    const initial = {};
    parameters.forEach(p => {
      initial[p.id] = {
        meta_clia: p.meta_clia != null ? String(p.meta_clia) : '',
        meta_clia_type: p.meta_clia_type || 'percent',
        meta_eflm: p.meta_eflm != null ? String(p.meta_eflm) : '',
      };
    });
    setGoals(initial);
  }, [parameters]);

  const handleSave = async (param) => {
    setSaving(param.id);
    const raw = goals[param.id] || {};
    const meta_clia = raw.meta_clia !== '' ? parseFloat(raw.meta_clia) : null;
    const meta_eflm = raw.meta_eflm !== '' ? parseFloat(raw.meta_eflm) : null;

    if ((raw.meta_clia !== '' && isNaN(meta_clia)) || (raw.meta_eflm !== '' && isNaN(meta_eflm))) {
      toast({ title: 'Error', description: 'Los valores deben ser números válidos.', variant: 'destructive' });
      setSaving(null);
      return;
    }

    const { error } = await supabase
      .from('parameters')
      .update({ meta_clia, meta_clia_type: raw.meta_clia_type, meta_eflm })
      .eq('id', param.id);

    if (error) {
      toast({ title: 'Error', description: 'No se pudo guardar la meta.', variant: 'destructive' });
    } else {
      toast({ title: 'Guardado', description: `Metas de '${param.name}' actualizadas.` });
      await refreshParameters();
    }
    setSaving(null);
  };

  if (parameters.length === 0) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Metas de Calidad CLIA / EFLM</h2>
        <p className="text-muted-foreground">Configure el Error Total Admisible para cada parámetro según CLIA 2024 y EFLM (Variabilidad Biológica).</p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr,100px,120px,140px,auto] gap-4 p-3 font-semibold bg-secondary text-sm text-muted-foreground uppercase">
          <span>Parámetro</span>
          <span>Tipo CLIA</span>
          <span>Meta CLIA</span>
          <span>Meta EFLM (%)</span>
          <span>Guardar</span>
        </div>
        <div className="divide-y">
          {parameters.map(param => {
            const g = goals[param.id] || {};
            const isAbsolute = g.meta_clia_type === 'absolute';
            return (
              <div key={param.id} className="grid grid-cols-[1fr,100px,120px,140px,auto] gap-4 p-3 items-center">
                <div>
                  <p className="font-semibold">{param.name}</p>
                  <p className="text-xs text-muted-foreground">{param.equipment_type}</p>
                </div>
                <select
                  value={g.meta_clia_type ?? 'percent'}
                  onChange={e => setGoals(prev => ({ ...prev, [param.id]: { ...prev[param.id], meta_clia_type: e.target.value } }))}
                  className="p-2 border border-border rounded-md text-sm w-full"
                >
                  <option value="percent">%</option>
                  <option value="absolute">Absoluto</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder={isAbsolute ? 'ej. 1' : 'ej. 10'}
                  value={g.meta_clia ?? ''}
                  onChange={e => setGoals(prev => ({ ...prev, [param.id]: { ...prev[param.id], meta_clia: e.target.value } }))}
                  className="p-2 border border-border rounded-md text-sm w-full"
                />
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="ej. 5.5"
                  value={g.meta_eflm ?? ''}
                  onChange={e => setGoals(prev => ({ ...prev, [param.id]: { ...prev[param.id], meta_eflm: e.target.value } }))}
                  className="p-2 border border-border rounded-md text-sm w-full"
                />
                <Button size="sm" onClick={() => handleSave(param)} disabled={saving === param.id}>
                  {saving === param.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ParameterGoalsTab;
