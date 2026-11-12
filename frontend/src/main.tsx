import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './auth';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><AuthProvider><App/><Toaster position="top-right" toastOptions={{duration:3600,style:{borderRadius:'12px',background:'#182740',color:'white',fontSize:'13px'}}}/></AuthProvider></BrowserRouter></React.StrictMode>
);
