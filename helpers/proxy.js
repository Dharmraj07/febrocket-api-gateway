const axios = require("axios");

const proxyRequest = async ({ req, res, serviceUrl, serviceName }) => {
  try {
    // Dynamically construct the target URL, preserving paths and query strings
    const targetUrl = `${serviceUrl}${req.originalUrl}`;

    // Filter out the 'host' header so the internal service doesn't reject it
    const headers = { ...req.headers };
    delete headers.host;

    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.method !== "GET" ? req.body : undefined,
      headers: headers,
      
      // CRITICAL: Prevent Axios from internally following 301/302 redirects
      maxRedirects: 0, 
      
      // CRITICAL: Treat redirects (300-302) as successful proxy responses
      validateStatus: function (status) {
        return status >= 200 && status <= 302;
      },
      
      // OPTIONAL BUT RECOMMENDED: stream binary files properly if needed
      responseType: "arraybuffer", 
    });

    // Forward all headers from the microservice back to the client
    Object.entries(response.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Send the exact status code and data back to the browser
    return res.status(response.status).send(response.data);

  } catch (error) {
    console.error(`[${serviceName} Proxy Error]:`, error.message);
    
    // Fallback error response if the microservice is completely unreachable
    const statusCode = error.response ? error.response.status : 502;
    return res.status(statusCode).json({
      success: false,
      message: `${serviceName} service error: ${error.message}`,
    });
  }
};

module.exports = { proxyRequest };
