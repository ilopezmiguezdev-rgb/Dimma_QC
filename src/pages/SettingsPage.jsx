import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import GeneralSettingsTab from '@/components/settings/GeneralSettingsTab';
import SecuritySettingsTab from '@/components/settings/SecuritySettingsTab';
import LaboratoriesPage from '@/pages/LaboratoriesPage';
import ParametrosPorEquipoPage from '@/pages/ParametrosPorEquipoPage';
import UserManagementPage from '@/pages/UserManagementPage'; // New component
import QCSettingsPage from '@/pages/QCSettingsPage';
import { Sliders as FileSliders, Users, Shield, Settings, Building2, CircuitBoard, UserCog, Target } from 'lucide-react';
import ParameterGoalsTab from '@/components/settings/ParameterGoalsTab';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const SettingsPage = () => {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const isAdmin = user?.role === 'admin';

    const tabsConfig = [
        { value: 'labs', icon: Building2, label: 'Laboratorios', component: <LaboratoriesPage />, adminOnly: true },
        { value: 'params-equip', icon: CircuitBoard, label: 'Parámetros por Equipo', component: <ParametrosPorEquipoPage />, adminOnly: true },
        { value: 'users-admin', icon: UserCog, label: 'Usuarios', component: <UserManagementPage />, adminOnly: true }, // New Tab
        { value: 'equipos-lotes', icon: FileSliders, label: 'Config. Equipos', component: <QCSettingsPage isTab={true} />, adminOnly: true },
        { value: 'quality-goals', icon: Target, label: 'Metas de Calidad', component: <ParameterGoalsTab />, adminOnly: true },
        { value: 'general', icon: Settings, label: 'General', component: <GeneralSettingsTab />, adminOnly: true },
        { value: 'security', icon: Shield, label: 'Seguridad', component: <SecuritySettingsTab />, adminOnly: false },
    ];

    const availableTabs = tabsConfig.filter(tab => !tab.adminOnly || isAdmin);
    const defaultTab = searchParams.get('tab') || availableTabs[0]?.value;

    return (
        <>
            <Helmet>
                <title>Configuración - DIMMA QC</title>
                <meta name="description" content="Configuración del sistema DIMMA QC." />
            </Helmet>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Configuración</h1>
                    <p className="text-muted-foreground">Gestione laboratorios, tipos de equipos y acceso de usuarios.</p>
                </div>

                <Tabs defaultValue={defaultTab} className="flex flex-col md:flex-row gap-6 items-start">
                    <TabsList className="flex flex-col h-auto bg-transparent p-0 w-full md:w-1/5 shrink-0">
                        {availableTabs.map(tab => (
                            <TabsTrigger key={tab.value} value={tab.value} className="w-full justify-start data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm px-4 py-3">
                                <tab.icon className="w-5 h-5 mr-3" /> {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    <div className="flex-1">
                        {availableTabs.map(tab => (
                            <TabsContent key={tab.value} value={tab.value} className="medical-card rounded-xl p-6 mt-0">
                                {tab.component}
                            </TabsContent>
                        ))}
                    </div>
                </Tabs>
            </div>
        </>
    );
};

export default SettingsPage;