import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import authService from '../services/authService';

/**
 * ProtectedRoute component that requires authentication to access children routes
 * If user is not authenticated, redirects to login page
 */
function ProtectedRoute() {
  const isAuthenticated = authService.isAuthenticated();
  
  // If not authenticated, redirect to login page
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  // If authenticated, render the child routes
  return <Outlet />;
}

export default ProtectedRoute; 