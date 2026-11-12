export const money = (n: string | number | undefined | null) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: import.meta.env.VITE_CURRENCY || 'INR', maximumFractionDigits: 2 }).format(Number(n || 0));
export const number = (n: number | string | undefined) => new Intl.NumberFormat('en-IN').format(Number(n || 0));
export const shortDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'}) : '—';
export const shortTime = (d?: string) => d ? new Date(d).toLocaleString('en-IN', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}) : '—';
export const initials = (s?:string) => (s || '?').trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('');
export const canManage = (role?: string) => role === 'admin' || role === 'manager';
export const canOperate = (role?: string) => canManage(role) || role === 'staff';
export const saveCsv = (filename:string, headings:string[], rows:(string|number)[][]) => {
  const enc=(v:string|number) => '"'+String(v??'').replaceAll('"','""')+'"';
  const csv=[headings,...rows].map(r=>r.map(enc).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF',csv], {type:'text/csv;charset=utf-8'});
  const link=document.createElement('a'); const href=URL.createObjectURL(blob);
  link.href=href;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
};
