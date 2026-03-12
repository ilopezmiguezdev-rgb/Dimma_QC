import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { UserPlus, Trash2, Edit, CheckCircle, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const EMPTY_FORM = { fullName: '', email: '', password: '', role: 'technician', laboratoryIds: [] };

const LabsDisplay = ({ labIds, userLabsMap }) => {
  const labs = (labIds || []).map(id => userLabsMap[id]).filter(Boolean);
  if (labs.length === 0) return <span className="text-muted-foreground text-sm">—</span>;
  if (labs.length <= 2) {
    return (
      <div className="flex flex-wrap gap-1">
        {labs.map(lab => (
          <Badge key={lab.id} variant="secondary" className="text-xs">{lab.name}</Badge>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1 items-center">
      <Badge variant="secondary" className="text-xs">{labs[0].name}</Badge>
      <Badge variant="outline" className="text-xs">+{labs.length - 1} más</Badge>
    </div>
  );
};

const LabMultiSelect = ({ allLabs, selectedIds, onChange }) => {
  const toggle = (id) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  return (
    <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2">
      {allLabs.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay laboratorios disponibles.</p>
      )}
      {allLabs.map(lab => (
        <div key={lab.id} className="flex items-center gap-2">
          <Checkbox
            id={`lab-${lab.id}`}
            checked={selectedIds.includes(lab.id)}
            onCheckedChange={() => toggle(lab.id)}
          />
          <Label htmlFor={`lab-${lab.id}`} className="cursor-pointer font-normal">
            {lab.name}
          </Label>
        </div>
      ))}
    </div>
  );
};

const UsersSettingsTab = () => {
  const [users, setUsers] = useState([]);
  const [laboratories, setLaboratories] = useState([]);
  const [userLabIds, setUserLabIds] = useState({}); // { userId: [labId, ...] }
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUser, setNewUser] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({ laboratoryIds: [] });
  const { toast } = useToast();
  const { session, user } = useAuth();

  const fetchLaboratories = useCallback(async () => {
    const { data, error } = await supabase.from('laboratories').select('id, name').eq('is_active', true);
    if (!error) setLaboratories(data || []);
  }, []);

  const fetchUserLabs = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_laboratories')
      .select('user_id, laboratory_id');
    if (!error && data) {
      const map = {};
      data.forEach(({ user_id, laboratory_id }) => {
        if (!map[user_id]) map[user_id] = [];
        map[user_id].push(laboratory_id);
      });
      setUserLabIds(map);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    if (user?.user_metadata?.role !== 'admin') {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-users', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setUsers(data.users || []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error loading users', description: error.message });
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [session, toast, user]);

  useEffect(() => {
    if (session) {
      fetchLaboratories();
      fetchUsers();
      fetchUserLabs();
    }
  }, [fetchLaboratories, fetchUsers, fetchUserLabs, session]);

  // Build a lookup map for lab id -> lab object for LabsDisplay
  const labsById = Object.fromEntries(laboratories.map(l => [l.id, l]));

  const handleCreateUser = async () => {
    if (!newUser.fullName || !newUser.email || !newUser.password) {
      toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Por favor completa todos los campos.' });
      return;
    }
    if (newUser.laboratoryIds.length === 0) {
      toast({ variant: 'destructive', title: 'Laboratorio requerido', description: 'Debes seleccionar al menos un laboratorio.' });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('create-app-user', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: {
          fullName: newUser.fullName,
          email: newUser.email,
          password: newUser.password,
          role: newUser.role,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const newUserId = data.user?.id;
      if (newUserId && newUser.laboratoryIds.length > 0) {
        const labInserts = newUser.laboratoryIds.map(labId => ({
          user_id: newUserId,
          laboratory_id: labId,
        }));
        const { error: labError } = await supabase
          .from('user_laboratories')
          .insert(labInserts);
        if (labError) {
          console.error('Lab assignment failed:', labError);
          toast({ variant: 'destructive', title: 'Advertencia', description: 'Usuario creado pero falló la asignación de laboratorios.' });
        }
      }

      toast({ title: 'Usuario creado', description: `${newUser.fullName} fue creado exitosamente.` });
      setNewUser(EMPTY_FORM);
      setIsCreateOpen(false);
      fetchUsers();
      fetchUserLabs();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al crear usuario', description: error.message });
    }
  };

  const handleOpenEdit = (u) => {
    setEditingUser(u);
    setEditForm({ laboratoryIds: userLabIds[u.id] || [] });
    setIsEditOpen(true);
  };

  const handleUpdateUser = async () => {
    if (editForm.laboratoryIds.length === 0) {
      toast({ variant: 'destructive', title: 'Laboratorio requerido', description: 'Debes seleccionar al menos un laboratorio.' });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('admin-update-user', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: {
          userId: editingUser.id,
          laboratoryIds: editForm.laboratoryIds,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Usuario actualizado', description: `Los laboratorios de ${editingUser.user_metadata?.full_name || editingUser.email} fueron actualizados.` });
      setIsEditOpen(false);
      setEditingUser(null);
      fetchUserLabs();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al actualizar usuario', description: error.message });
    }
  };

  const handleAuthorizeUser = async (userId, email) => {
    try {
      const { data, error } = await supabase.functions.invoke('authorize-user', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: { userId },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({ title: "Usuario autorizado", description: `El usuario ${email} ha sido autorizado.` });
      fetchUsers();
    } catch (error) {
      toast({ variant: "destructive", title: "Error de autorización", description: error.message });
    }
  };

  const getRoleText = (role) => {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'technician': return 'Técnico';
      case 'biochemist': return 'Bioquímico';
      default: return 'Usuario';
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewUser(prev => ({ ...prev, [name]: value }));
  };

  if (user?.user_metadata?.role !== 'admin') {
    return (
      <div>
        <h2 className="text-2xl font-bold text-foreground">Gestión de Usuarios</h2>
        <p className="text-muted-foreground mt-4">No tienes permisos para acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-foreground">Gestión de Usuarios</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { fetchUsers(); fetchUserLabs(); }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Crear Usuario
          </Button>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Nuevo Usuario</DialogTitle>
            <DialogDescription>Completa los datos para agregar un nuevo miembro del equipo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <input
              type="text"
              name="fullName"
              placeholder="Nombre completo"
              value={newUser.fullName}
              onChange={handleInputChange}
              className="w-full p-2 border rounded"
            />
            <input
              type="email"
              name="email"
              placeholder="Correo electrónico"
              value={newUser.email}
              onChange={handleInputChange}
              className="w-full p-2 border rounded"
            />
            <input
              type="password"
              name="password"
              placeholder="Contraseña"
              value={newUser.password}
              onChange={handleInputChange}
              className="w-full p-2 border rounded"
            />
            <select
              name="role"
              value={newUser.role}
              onChange={handleInputChange}
              className="w-full p-2 border rounded"
            >
              <option value="technician">Técnico</option>
              <option value="biochemist">Bioquímico</option>
              <option value="admin">Administrador</option>
            </select>
            <div className="space-y-1">
              <Label className="text-sm font-medium">
                Laboratorios asignados <span className="text-destructive">*</span>
              </Label>
              <LabMultiSelect
                allLabs={laboratories}
                selectedIds={newUser.laboratoryIds}
                onChange={(ids) => setNewUser(prev => ({ ...prev, laboratoryIds: ids }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateOpen(false); setNewUser(EMPTY_FORM); }}>Cancelar</Button>
            <Button onClick={handleCreateUser}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>
              {editingUser?.user_metadata?.full_name || editingUser?.email} — actualiza los laboratorios asignados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">
                Laboratorios asignados <span className="text-destructive">*</span>
              </Label>
              <LabMultiSelect
                allLabs={laboratories}
                selectedIds={editForm.laboratoryIds}
                onChange={(ids) => setEditForm(prev => ({ ...prev, laboratoryIds: ids }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditOpen(false); setEditingUser(null); }}>Cancelar</Button>
            <Button onClick={handleUpdateUser}>Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User List */}
      <div className="space-y-4">
        {loading ? (
          <p>Cargando usuarios...</p>
        ) : (
          users.map(u => (
            <div key={u.id} className="flex items-center justify-between p-4 bg-secondary rounded-lg gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{u.user_metadata?.full_name || u.email}</p>
                <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                <div className="mt-1">
                  <LabsDisplay labIds={userLabIds[u.id]} userLabsMap={labsById} />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-sm font-medium px-2 py-1 rounded-md whitespace-nowrap ${!u.email_confirmed_at ? 'bg-yellow-100 text-yellow-800' : 'bg-primary/10 text-primary'}`}>
                  {getRoleText(u.user_metadata?.role)}{!u.email_confirmed_at ? ' (Pendiente)' : ''}
                </span>

                {!u.email_confirmed_at && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Autorizar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Confirmar autorización?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Estás a punto de autorizar al usuario {u.email}. Una vez autorizado, podrá acceder al sistema.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleAuthorizeUser(u.id, u.email)}>Autorizar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(u)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => toast({ title: 'Próximamente', description: 'La eliminación de usuarios estará disponible pronto.' })}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default UsersSettingsTab;
