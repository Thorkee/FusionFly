import axios from 'axios';

const API_URL = '/api/auth';

// Get token from local storage
const getToken = () => {
  return localStorage.getItem('token');
};

// Set token to local storage
const setToken = (token) => {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
};

// Get user from local storage
const getUser = () => {
  const userJson = localStorage.getItem('user');
  return userJson ? JSON.parse(userJson) : null;
};

// Set user to local storage
const setUser = (user) => {
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  } else {
    localStorage.removeItem('user');
  }
};

// Register a new user
const register = async (name, email, password) => {
  try {
    const response = await axios.post(`${API_URL}/register`, {
      name,
      email,
      password
    });
    
    if (response.data.token) {
      setToken(response.data.token);
      setUser(response.data.user);
    }
    
    return response.data;
  } catch (error) {
    throw error.response?.data?.error || 'Registration failed';
  }
};

// Login a user
const login = async (email, password) => {
  try {
    const response = await axios.post(`${API_URL}/login`, {
      email,
      password
    });
    
    if (response.data.token) {
      setToken(response.data.token);
      setUser(response.data.user);
    }
    
    return response.data;
  } catch (error) {
    throw error.response?.data?.error || 'Login failed';
  }
};

// Logout a user
const logout = () => {
  setToken(null);
  setUser(null);
};

// Get current user profile
const getProfile = async () => {
  try {
    const response = await axios.get(`${API_URL}/profile`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    
    return response.data;
  } catch (error) {
    throw error.response?.data?.error || 'Failed to get profile';
  }
};

// Update user profile
const updateProfile = async (name, email) => {
  try {
    const response = await axios.put(`${API_URL}/profile`, {
      name,
      email
    }, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    
    if (response.data.user) {
      setUser(response.data.user);
    }
    
    return response.data;
  } catch (error) {
    throw error.response?.data?.error || 'Failed to update profile';
  }
};

// Change password
const changePassword = async (currentPassword, newPassword) => {
  try {
    const response = await axios.post(`${API_URL}/change-password`, {
      currentPassword,
      newPassword
    }, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    
    return response.data;
  } catch (error) {
    throw error.response?.data?.error || 'Failed to change password';
  }
};

// Setup axios interceptor to include auth token in all requests
axios.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 responses (unauthorized)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear auth data from storage if unauthorized
      logout();
      
      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

const authService = {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  getToken,
  getUser,
  isAuthenticated: () => !!getToken()
};

export default authService; 