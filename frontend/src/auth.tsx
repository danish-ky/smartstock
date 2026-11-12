import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, hasSession } from './api';
import type { User } from './types';
type Auth = { user:User|null; loading:boolean; login:(username:string,password:string)=>Promise<void>; logout:()=>Promise<void>; refresh:()=>Promise<void>; };
const AuthContext=createContext<Auth|null>(null);
export function AuthProvider({children}:{children:ReactNode}) {
  const [user,setUser]=useState<User|null>(null);
  const [loading,setLoading]=useState(true);
  const refresh=useCallback(async()=> { const me=await api.get<User>('/auth/me/');setUser(me); },[]);
  useEffect(()=>{
    let live=true;
    if(hasSession()) api.get<User>('/auth/me/').then(u=>{if(live)setUser(u);}).catch(()=>{if(live)setUser(null);}).finally(()=>{if(live)setLoading(false);});
    else setLoading(false);
    const lost=()=>setUser(null);
    window.addEventListener('smartstock:logout',lost);
    return()=>{live=false;window.removeEventListener('smartstock:logout',lost);};
  },[]);
  const login=async(username:string,password:string)=>{await api.login(username,password);try{await refresh();}catch(e){await api.logout();throw e;}};
  const logout=async()=>{await api.logout();setUser(null);};
  return <AuthContext.Provider value={{user,loading,login,logout,refresh}}>{children}</AuthContext.Provider>;
}
export function useAuth(){const x=useContext(AuthContext);if(!x)throw new Error('AuthProvider missing');return x;}
