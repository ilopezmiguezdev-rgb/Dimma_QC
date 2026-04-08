import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserPlus, Edit, Trash2, Shield, Building2, Key } from 'lucide-react';
import { hasPermission } from '@/utils/permissions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const UserManagementPage = () => {
  const [users, setUsers] = useState([]);
  const [laboratories, setLaboratories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    password: '',
    role: 'technician',
    laboratoryId: '',
  });

  const { user: currentUser, session } = useAuth();
  const { toast } = useToast();

  const canManageUsers = hasPermission(currentUser, 'create_user');

  const fetchAllData = async () => {
    // ... (fetchAllData implementation remains unchanged)
    setLoading(true);
    try {
      // 1. Fetch Laboratories
      const { data: labsData, error: labsError } = await supabase
        .from('laboratories')
        .select('id, name')
        .eq('is_active', true);

      if (labsError) throw labsError;
      setLaboratories(labsData || []);

      // 2. Fetch Profiles directly
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id, 
          email, 
          full_name, 
          role, 
          laboratory_id, 
          created_at,
          is_authorized
        `)
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // 3. Map profile data
      const mergedUsers = profilesData.map(p => ({
        id: p.id,
        email: p.email,
        laboratoryId: p.laboratory_id,
        user_metadata: {
          full_name: p.full_name,
          role: p.role || 'technician'
        },
        email_confirmed_at: p.created_at
      }));

      setUsers(mergedUsers);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los usuarios.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) fetchAllData();
  }, [session]);

  const handleCreateUser = async () => {
    const labRequired = formData.role !== 'admin';
    if (!formData.email || !formData.password || !formData.fullName || (labRequired && !formData.laboratoryId)) {
      toast({ variant: 'destructive', title: 'Error', description: 'Email, nombre completo, contraseña y laboratorio son requeridos.' });
      return;
    }

    try {
      // 1. Create Auth User
      const { data, error } = await supabase.functions.invoke('create-app-user', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: {
          email: formData.email,
          password: formData.password,
          role: formData.role,
          fullName: formData.fullName
        }
      });

      if (error || data.error) throw new Error(error?.message || data.error);

      // 2. Assign Laboratory (Update Profile)
      const newUserId = data.user?.id;
      if (newUserId) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ laboratory_id: formData.role === 'admin' ? null : (formData.laboratoryId || null) })
          .eq('id', newUserId);

        if (profileError) throw profileError;
      }

      toast({ title: 'Usuario creado', description: 'El usuario ha sido creado correctamente.' });
      setIsCreateOpen(false);
      resetForm();
      fetchAllData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al crear', description: error.message });
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    try {
      const { data, error } = await supabase.functions.invoke('admin-update-user', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: {
          userId: selectedUser.id,
          role: formData.role,
          laboratoryIds: formData.role === 'admin' ? [] : (formData.laboratoryId ? [formData.laboratoryId] : []),
          name: formData.fullName,
        }
      });

      if (error) {
        // Extract actual error body from FunctionsHttpError
        let msg = error.message;
        try {
          const errBody = await error.context?.json();
          if (errBody?.error) msg = errBody.error;
        } catch {}
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ laboratory_id: formData.role === 'admin' ? null : (formData.laboratoryId || null) })
        .eq('id', selectedUser.id);

      if (profileError) throw profileError;

      toast({ title: 'Usuario actualizado', description: 'Los cambios han sido guardados.' });
      setIsEditOpen(false);
      resetForm();
      fetchAllData();
    } catch (error) {
      console.error('Update user error:', error);
      toast({ variant: 'destructive', title: 'Error al actualizar', description: error.message });
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: { userId: selectedUser.id }
      });

      if (error || data.error) throw new Error(error?.message || data.error);

      toast({ title: 'Usuario eliminado', description: 'El usuario ha sido eliminado permanentemente.' });
      setIsDeleteAlertOpen(false);
      setSelectedUser(null);
      fetchAllData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al eliminar', description: error.message });
    }
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      fullName: user.user_metadata?.full_name || '',
      password: '', // Blank by default
      role: user.user_metadata?.role || 'technician',
      laboratoryId: user.user_metadata?.role === 'admin' ? 'all' : (user.laboratoryId || '')
    });
    setIsEditOpen(true);
  };

  const openDeleteAlert = (user) => {
    setSelectedUser(user);
    setIsDeleteAlertOpen(true);
  };

  const resetForm = () => {
    setFormData({ email: '', fullName: '', password: '', role: 'technician', laboratoryId: '' });
    setSelectedUser(null);
  };

  const getLabName = (labId) => {
    const lab = laboratories.find(l => l.id === labId);
    return lab ? lab.name : 'Sin asignar';
  };

  if (loading) return <div className="flex justify-center items-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestión de Usuarios</h2>
          <p className="text-muted-foreground">Administración centralizada de cuentas, roles y accesos a laboratorios.</p>
        </div>
        {canManageUsers && (
          <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="medical-gradient text-white">
            <UserPlus className="w-4 h-4 mr-2" /> Agregar Usuario
          </Button>
        )}
      </div>

      <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Usuario / Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Laboratorio Asignado</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">{u.user_metadata?.full_name || 'Sin nombre'}</span>
                    <span className="text-xs text-muted-foreground">{u.email}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={u.user_metadata?.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                    {u.user_metadata?.role === 'admin' ? 'Administrador' : u.user_metadata?.role === 'biochemist' ? 'Bioquímico' : 'Técnico'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center text-sm">
                    <Building2 className="w-3 h-3 mr-2 text-gray-500" />
                    {u.user_metadata?.role === 'admin' ? 'Todos los laboratorios' : getLabName(u.laboratoryId)}
                  </div>
                </TableCell>
                <TableCell>
                  {u.email_confirmed_at ?
                    <Badge variant="success" className="text-xs">Confirmado</Badge> :
                    <Badge variant="warning" className="text-xs">Pendiente</Badge>
                  }
                </TableCell>
                <TableCell className="text-right">
                  {canManageUsers && (
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditModal(u)}>
                        <Edit className="w-4 h-4 text-blue-600" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openDeleteAlert(u)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No hay usuarios registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* CREATE DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Nuevo Usuario</DialogTitle>
            <DialogDescription>Ingrese los credenciales y asigne un laboratorio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre Completo</label>
              <Input
                value={formData.fullName}
                onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Juan Pérez"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="usuario@dimmatec.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Contraseña</label>
              <Input
                type="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                placeholder="********"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Rol</label>
                <Select value={formData.role} onValueChange={v => setFormData({ ...formData, role: v, laboratoryId: v === 'admin' ? 'all' : formData.laboratoryId })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technician">Técnico</SelectItem>
                    <SelectItem value="biochemist">Bioquímico</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Laboratorio</label>
                {formData.role === 'admin' ? (
                  <Input value="Todos los laboratorios" disabled className="bg-gray-100" />
                ) : (
                  <Select value={formData.laboratoryId} onValueChange={v => setFormData({ ...formData, laboratoryId: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {laboratories.map(lab => (
                        <SelectItem key={lab.id} value={lab.id}>{lab.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateUser}>Crear Usuario</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>Modifique el rol, laboratorio o restablezca la contraseña.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre Completo</label>
              <Input
                value={formData.fullName}
                onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Juan Pérez"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input value={formData.email} disabled className="bg-gray-100" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Key className="w-3 h-3" /> Nueva Contraseña (Opcional)
              </label>
              <Input
                type="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                placeholder="Dejar vacío para mantener la actual"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Rol</label>
                <Select value={formData.role} onValueChange={v => setFormData({ ...formData, role: v, laboratoryId: v === 'admin' ? 'all' : formData.laboratoryId })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technician">Técnico</SelectItem>
                    <SelectItem value="biochemist">Bioquímico</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Laboratorio</label>
                {formData.role === 'admin' ? (
                  <Input value="Todos los laboratorios" disabled className="bg-gray-100" />
                ) : (
                  <Select value={formData.laboratoryId} onValueChange={v => setFormData({ ...formData, laboratoryId: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {laboratories.map(lab => (
                        <SelectItem key={lab.id} value={lab.id}>{lab.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateUser}>Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE ALERT */}
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente al usuario <b>{selectedUser?.email}</b>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default UserManagementPage;