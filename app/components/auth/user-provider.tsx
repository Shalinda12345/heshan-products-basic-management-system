'use client';

import { createContext, useContext } from 'react';
import type { UserInfo } from '@/app/lib/auth';
import { ROLE_INFO, type Permission } from '@/app/lib/permissions';

// The signed-in user, as the root layout read it from the database. Used to show only what the user may do;
// the API checks every request again, so hiding something here is a convenience, not the protection.
const UserContext = createContext<UserInfo | null>(null);

export function UserProvider({ user, children }: { user: UserInfo | null; children: React.ReactNode }) {
    return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): UserInfo | null {
    return useContext(UserContext);
}

// can('sales.void') → whether the signed-in user's role includes that permission
export function usePermissions() {
    const user = useContext(UserContext);
    return {
        user,
        roleLabel: user ? ROLE_INFO[user.role].label : '',
        can: (permission: Permission) => !!user?.permissions.includes(permission),
    };
}
