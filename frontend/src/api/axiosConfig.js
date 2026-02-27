import axios from 'axios';

const hostname = window.location.hostname;
const isLocalNetwork = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.');

const API_BASE = isLocalNetwork
  ? `http://${hostname}:5001`
  : (import.meta.env.VITE_BACKEND_BASE_URL || 'https://edu-write-ai--ismartgamer703.replit.app'); // Use env or fallback to your backend URL (NOT your Vercel frontend URL)

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 60000,
});

// Log all requests for debugging
api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Log all responses and catch network errors
api.interceptors.response.use(
  (response) => {
    console.log(`[API Response] ${response.status}`, response.data);
    return response;
  },
  (error) => {
    if (error.response) {
      // Server responded with error status
      console.error(`[API Error] ${error.response.status}:`, error.response.data);
    } else if (error.request) {
      // Request made but no response received
      console.error('[API Network Error] No response from server:', {
        url: error.config?.url,
        method: error.config?.method,
        message: error.message,
        baseURL: error.config?.baseURL,
      });
    } else {
      console.error('[API Error]', error.message);
    }
    return Promise.reject(error);
  }
);

export default api;
