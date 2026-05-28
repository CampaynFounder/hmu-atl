import { createContext, useContext, useState, type ReactNode } from 'react';

interface UserState {
  isSuperAdmin: boolean;
  profileType: string;
}

interface UserContextType extends UserState {
  setUser: (u: UserState) => void;
}

const UserContext = createContext<UserContextType>({
  isSuperAdmin: false,
  profileType: 'rider',
  setUser: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserState>({ isSuperAdmin: false, profileType: 'rider' });
  return (
    <UserContext.Provider value={{ ...user, setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserContext() {
  return useContext(UserContext);
}
