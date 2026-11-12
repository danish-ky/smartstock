import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Button, Modal } from './UI';

/** Code 128 inventory label; SKU is the code's canonical unique value. */
export function BarcodeLabel({sku,name,onClose}:{sku:string;name:string;onClose:()=>void}){
  const svgRef=useRef<SVGSVGElement>(null);
  useEffect(()=>{
    if(!svgRef.current)return;
    try { JsBarcode(svgRef.current,sku,{format:'CODE128',displayValue:true,margin:18,height:78,width:2}); }
    catch { /* SKU may contain characters that cannot be encoded */ }
  },[sku]);
  function download(){
    if(!svgRef.current)return;
    const blob=new Blob([new XMLSerializer().serializeToString(svgRef.current)],{type:'image/svg+xml;charset=utf-8'});
    const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;
    a.download=`barcode-${sku.replace(/[^A-Za-z0-9_-]/g,'_')}.svg`;a.click();
    setTimeout(()=>URL.revokeObjectURL(href),1500);
  }
  return <Modal open onClose={onClose} title="Product barcode label" subtitle={`${name} • ${sku}`}>
    <div className="barcode-preview"><svg ref={svgRef} aria-label={`Barcode for ${sku}`}/></div>
    <p className="barcode-note">Code 128, based on your unique internal SKU. This is not a retail GTIN/EAN registration.</p>
    <div className="form-actions"><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={download}>Download SVG label</Button></div>
  </Modal>;
}

/** Requires localhost or HTTPS and the user's camera permission. */
export function BarcodeScanner({onScan,onClose}:{onScan:(code:string)=>void;onClose:()=>void}){
  const video=useRef<HTMLVideoElement>(null);
  const [error,setError]=useState('');
  const scan=useRef(onScan);scan.current=onScan;
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    let stopped=false;
    let controls:{stop:()=>void}|null=null;
    const reader=new BrowserMultiFormatReader();
    if(!navigator.mediaDevices?.getUserMedia){setError('Camera requires HTTPS or localhost. You can use a USB scanner in the search field.');return;}
    if(!video.current)return;
    reader.decodeFromVideoDevice(undefined,video.current,(result)=>{
      if(stopped || !result)return;
      stopped=true;controls?.stop();scan.current(result.getText().trim());close.current();
    }).then(c=>{controls=c;if(stopped)c.stop();}).catch(e=>{if(!stopped)setError((e as Error).message||'Camera unavailable');});
    return ()=>{stopped=true;controls?.stop();};
  },[]);
  return <Modal open onClose={onClose} title="Scan product barcode" subtitle="Aim your camera at a Code 128 / EAN barcode">
    <video className="barcode-camera" ref={video} autoPlay playsInline muted/>
    {error&&<p className="barcode-error">{error}</p>}
    <p className="barcode-note">A USB scanner also works: focus the product search box and scan.</p>
    <div className="form-actions"><Button variant="secondary" onClick={onClose}>Close scanner</Button></div>
  </Modal>;
}
