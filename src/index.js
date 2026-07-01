import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';

import Enter from "./components/Enter/Enter";
import Loading from './components/Loading/Loading'
import './styles/global.scss'

// Apply the saved theme before first paint (foundation for dark mode)
import { applyTheme } from './settings/settings'
applyTheme()

import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";

// Home pulls in the heavy charting/3D libraries (plotly, three). Load it
// lazily so the landing page (Enter) ships a much smaller initial bundle;
// the Loading spinner covers the brief chunk fetch on navigation.
const Home = lazy(() => import('./pages/Home'))

const homeRoute = (
  <Suspense fallback={<div className='container'><Loading /></div>}>
    <div className='container'><Home /></div>
  </Suspense>
)

const root = ReactDOM.createRoot(document.getElementById('root'));

const router = createBrowserRouter([
  {
    path: "/",
    element: <div className='container'> <Enter /></div>
  },
  {
    path: "/Loading",
    element: homeRoute
  },
  {
    path: "/Home",
    element: homeRoute
  }
])

root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);