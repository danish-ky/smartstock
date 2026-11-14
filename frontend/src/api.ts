import type { Page } from './types';
const BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
const ACCESS = 'smartstock_access';
const REFRESH = 'smartstock_refresh';
let refreshPromise: Promise<boolean> | null = null;

function setTokens(access:string, refresh:string) {
  sessionStorage.setItem(ACCESS,access);
  sessionStorage.setItem(REFRESH,refresh);
}
export function clearSession() {
  sessionStorage.removeItem(ACCESS);
  sessionStorage.removeItem(REFRESH);
}
export function hasSession() { return !!sessionStorage.getItem(REFRESH); }

async function refreshTokens():Promise<boolean> {
  const refresh=sessionStorage.getItem(REFRESH);
  if (!refresh) return false;
  try {
    const res=await fetch(`${BASE}/auth/refresh/`, {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh})});
    if(!res.ok) throw new Error('Session expired');
    const data=await res.json();
    setTokens(data.access,data.refresh || refresh);
    return true;
  } catch { clearSession(); window.dispatchEvent(new Event('smartstock:logout'));return false; }
}

function details(data: unknown, status:number):string {
  if(typeof data === 'string') return data;
  if(data && typeof data === 'object') {
    const obj=data as Record<string,unknown>;
    if(typeof obj.detail==='string') return obj.detail;
    const first=Object.entries(obj)[0];
    if(first) return `${first[0]==='non_field_errors'?'':first[0]+': '}${Array.isArray(first[1])?first[1].join(', '):String(first[1])}`;
  }
  return `Request failed (${status})`;
}

export async function request<T=unknown>(path:string, options:RequestInit={}, retry=true):Promise<T> {
  const headers:Record<string,string>={...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}),...(options.headers as Record<string,string>||{})};
  const token=sessionStorage.getItem(ACCESS);
  if(token) headers.Authorization=`Bearer ${token}`;
  const res=await fetch(`${BASE}${path.startsWith('/')?path:'/'+path}`,{...options,headers});
  if(res.status===401 && retry && sessionStorage.getItem(REFRESH)) {
    if(!refreshPromise) refreshPromise=refreshTokens().finally(()=>{refreshPromise=null;});
    if(await refreshPromise) return request<T>(path,options,false);
  }
  if(!res.ok) {
    let data:unknown;
    try {data=await res.json();}catch{data='Network/API error';}
    throw new Error(details(data,res.status));
  }
  if(res.status===204||res.status===205) return undefined as T;
  return res.json() as Promise<T>;
}
// Fetch binary PDFs with the same JWT refresh behavior as JSON endpoints.
async function requestPdf(path: string, retry = true): Promise<Blob> {
  const token = sessionStorage.getItem(ACCESS);
  const response = await fetch(`${BASE}${path.startsWith('/') ? path : '/' + path}`, {
    // DRF negotiates renderers before serving the binary FileResponse.
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: '*/*' },
  });
  if (response.status === 401 && retry && sessionStorage.getItem(REFRESH)) {
    if (!refreshPromise) refreshPromise = refreshTokens().finally(() => { refreshPromise = null; });
    if (await refreshPromise) return requestPdf(path, false);
  }
  if (!response.ok) {
    let data: unknown;
    try { data = await response.json(); } catch { data = `PDF request failed (HTTP ${response.status})`; }
    throw new Error(details(data, response.status));
  }
  if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/pdf')) {
    throw new Error('Expected a PDF document from the server.');
  }
  const blob = await response.blob();
  if (!blob.size || blob.size > 15 * 1024 * 1024) throw new Error('PDF is empty or too large.');
  return blob;
}

/** Authenticated product CSV/XLSX download, including access-token refresh. */
export async function downloadProductFile(path: string, filename: string): Promise<void> {
  if (!/^\/products\/bulk\/(?:export|template)\/\?file_format=(?:csv|xlsx)$/.test(path)) {
    throw new Error('Invalid catalog download path.');
  }
  const fetchFile = (token: string | null) => fetch(`${BASE}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: '*/*' },
  });
  let res = await fetchFile(sessionStorage.getItem(ACCESS));
  if (res.status === 401 && await refreshTokens()) {
    res = await fetchFile(sessionStorage.getItem(ACCESS));
  }
  if (!res.ok) throw new Error(`Catalog download failed (${res.status})`);
  const blob = await res.blob();
  if (!blob.size || blob.size > 15 * 1024 * 1024) throw new Error('Invalid or oversized download.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const api = {
  login:async(username:string,password:string)=> {
    const tokens=await request<{access:string;refresh:string}>('/auth/login/',{method:'POST',body:JSON.stringify({username,password})},false);
    setTokens(tokens.access,tokens.refresh);
    return tokens;
  },
  logout:async()=> {
    // Reauthenticate first if the short-lived access token has expired, then
    // blacklist the currently active refresh token before clearing storage.
    try {
      let refresh=sessionStorage.getItem(REFRESH);
      if(refresh) {
        try { await request('/auth/logout/',{method:'POST',body:JSON.stringify({refresh})},false); }
        catch {
          if(await refreshTokens()) {
            refresh=sessionStorage.getItem(REFRESH);
            if(refresh) await request('/auth/logout/',{method:'POST',body:JSON.stringify({refresh})},false);
          }
        }
      }
    }catch{/* A network outage must never prevent local sign-out. */}
    clearSession();
  },
  get:<T>(path:string)=>request<T>(path),
  pdf:(path:string)=>requestPdf(path),
  post:<T>(path:string,body:unknown)=>request<T>(path,{method:'POST',body:JSON.stringify(body)}),
  put:<T>(path:string,body:unknown)=>request<T>(path,{method:'PUT',body:JSON.stringify(body)}),
  patch:<T>(path:string,body:unknown)=>request<T>(path,{method:'PATCH',body:JSON.stringify(body)}),
  del:<T>(path:string)=>request<T>(path,{method:'DELETE'}),
  bulkImport:<T>(file:File, mode:'create'|'upsert', commit:boolean)=> {
    const data = new FormData();
    data.append('file',file);
    data.append('mode',mode);
    data.append('commit',String(commit));
    return request<T>('/products/bulk/import/',{method:'POST',body:data});
  },
  uploadImage:<T>(id:number,file:File)=>{const form=new FormData();form.append('image',file);return request<T>(`/products/${id}/image/`,{method:'POST',body:form});},
  removeImage:<T>(id:number)=>request<T>(`/products/${id}/image/`,{method:'DELETE'}),
  list:async<T>(path:string):Promise<T[]>=>{
    let next:string|null=path;const all:T[]=[];
    let pages=0;
    while(next && pages<50){
      const page:Page<T>|T[]=await request<Page<T>|T[]>(next.startsWith('http')?new URL(next).pathname+new URL(next).search:next);
      if(Array.isArray(page)) return page;
      all.push(...page.results);
      next=page.next;pages++;
    }
    return all;
  }
};

/** Authenticated PDF download, with the same JWT refresh behavior as API calls. */
export async function downloadInvoice(orderId:number, orderNumber:string):Promise<void> {
  const url = `${BASE}/orders/${orderId}/invoice/`;
  async function fetchPdf(token:string|null):Promise<Response> {
    return fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{}});
  }
  let response=await fetchPdf(sessionStorage.getItem(ACCESS));
  if(response.status===401 && await refreshTokens()) response=await fetchPdf(sessionStorage.getItem(ACCESS));
  if(!response.ok) throw new Error(`Invoice download failed (${response.status})`);
  const blob=await response.blob();
  const fileUrl=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=fileUrl;a.download=`${orderNumber}-invoice.pdf`;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(fileUrl),2500);
}
