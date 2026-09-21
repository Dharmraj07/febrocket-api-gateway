const express = require("express");
const axios = require("axios");
const { proxyRequest } = require("../helpers/proxy");

const router = express.Router();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://localhost:3001";
const AUTH_SERVICE_HEALTH = process.env.AUTH_SERVICE_HEALTH || `${AUTH_SERVICE_URL}/health`;

// Health check for Auth Service
router.get("/health", async (_req, res) => {
  try {
    const response = await axios.get(AUTH_SERVICE_HEALTH, { validateStatus: () => true });
    return res.status(response.status).json({
      status: response.status >= 200 && response.status < 300 ? "ok" : "degraded",
      authService: response.data,
    });
  } catch (error) {
    return res.status(503).json({
      status: "degraded",
      message: "Auth Service is unavailable",
    });
  }
});

// Explicitly handle Google OAuth callback to prevent 302 redirect crashes
router.get("/google/callback", async (req, res, next) => {
  try {
    // req.originalUrl preserves the full path ("/api/auth/google/callback") AND the massive "?code=..." query string
    const targetUrl = `${AUTH_SERVICE_URL}${req.originalUrl}`; 

    const response = await axios({
      method: "GET",
      url: targetUrl,
      headers: {
        ...req.headers,
        host: undefined // Prevent host header mismatch on internal networks
      },
      // CRITICAL FIX: Stop Axios from intercepting the Google callback redirect
      maxRedirects: 0, 
      // CRITICAL FIX: Tell Axios that a 302 Redirect is a SUCCESS, not an error
      validateStatus: function (status) {
        return status >= 200 && status <= 302; 
      }
    });

    // Forward all headers (especially the massive Set-Cookie JWT headers) to the browser
    Object.entries(response.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Send the 302 status back to the browser so it redirects to the frontend dashboard
    return res.status(response.status).send(response.data);

  } catch (error) {
    console.error("Gateway Google Auth Error:", error.message);
    next(error);
  }
});

// Catch-all route forwarding for all other Auth Service requests
router.use(async (req, res) => {
  return proxyRequest({
    req,
    res,
    serviceUrl: AUTH_SERVICE_URL,
    serviceName: "Auth",
  });
});

module.exports = router;
