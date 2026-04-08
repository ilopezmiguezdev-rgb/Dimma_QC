export const hasPermission = (user, action) => {
    const role = user?.user_metadata?.role;
    if (!role) return false;

    if (role === 'admin') return true; // Admin has all permissions by default

    switch (action) {
        case 'validate_results':
        case 'manage_lots':
        case 'delete_qc_report':
            return role === 'biochemist';

        case 'create_user':
        case 'delete_equipment':
        case 'delete_laboratory':
            return false; // Only admin (handled by the check above)

        default:
            return true; // Default to allow basic logging/viewing if not strictly restricted
    }
};
