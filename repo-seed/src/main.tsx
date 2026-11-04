import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import Site from './Site';
import Admin from './Admin';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><Routes>
    <Route path="/" element={<Site />} />
    <Route path="/admin" element={<Admin />} />
    <Route path="/admin/equipment" element={<Admin />} />
    <Route path="*" element={<main><h1>Страница не найдена</h1><Link to="/">Вернуться к записи</Link></main>} />
  </Routes></BrowserRouter></React.StrictMode>,
);
