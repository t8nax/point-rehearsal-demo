import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Link } from 'react-router-dom';
import Site from './Site';
import Admin from './Admin';
import './style.css';
import './admin-settings.css';

const router = createBrowserRouter([
  { path: '/', element: <Site/> },
  { path: '/admin/*', element: <Admin/> },
  { path: '*', element: <main><h1>Страница не найдена</h1><Link to="/">Вернуться к записи</Link></main> },
]);
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router}/></React.StrictMode>);
