import { createContext, useContext, useState, type ReactNode } from 'react';

interface UserState {
  isSuperAdmin: boolean;
  profileType: string;
  // Superadmin kill-switch for the account-deletion UI. Defaults true so it
  // fails OPEN — the delete option shows unless the server explicitly disables it.
  accountDeletionEnabled: boolean;
}

interface UserContextType extends UserState {
  setUser: (u: UserState) => void;
}

const UserContext = createContext<UserContextType>({
  isSuperAdmin: false,
  profileType: 'rider',
  accountDeletionEnabled: true,
  setUser: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserState>({ isSuperAdmin: false, profileType: 'rider', accountDeletionEnabled: true });
  return (
    <UserContext.Provider value={{ ...user, setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserContext() {
  return useContext(UserContext);
}
