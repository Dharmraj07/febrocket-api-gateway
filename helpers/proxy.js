const axios = require("axios");

const buildUpstreamUrl = (baseUrl, originalUrl) => {
  const serviceBase = String(baseUrl || "").trim();
  const requestPath = String(originalUrl || "/");

  if (!serviceBase) {
    throw new Error("Service base URL is missing.");
  }

  const upstream = new URL(serviceBase);
  const configuredPath = upstream.pathname.replace(/\/+$/, "") || "/";
  const requestUrl = new URL(requestPath, "http://gateway.local");
  const requestPathname = requestUrl.pathname;

  if (configuredPath !== "/" && requestPathname === configuredPath) {
    upstream.pathname = requestPathname;
  } else if (configuredPath !== "/" && requestPathname.startsWith(`${configuredPath}/`)) {
    upstream.pathname = requestPathname;
  } else {
    upstream.pathname = `${configuredPath === "/" ? "" : configuredPath}${requestPathname}`.replace(/\/+/g, "/");
  }

  upstream.search = requestUrl.search;
  return upstream.toString();
};

const shouldForwardBody = (req) => {
  const contentType = String(req.headers["content-type"] || "");
  return req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE" && !contentType.startsWith("multipart/");
};

const proxyRequest = async ({ req, res, serviceUrl, serviceName }) => {
  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers["content-length"];

    const targetUrl = buildUpstreamUrl(serviceUrl, req.originalUrl);
    const requestConfig = {
      method: req.method,
      url: targetUrl,
      headers,
      validateStatus: () => true,
      responseType: "json",
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    };

    if (req.method === "GET" || req.method === "HEAD") {
      requestConfig.data = undefined;
    } else if (req.headers["content-type"] && req.headers["content-type"].startsWith("multipart/")) {
      requestConfig.data = req;
    } else {
      requestConfig.data = req.body;
    }

    const response = await axios(requestConfig);

    if (response.headers?.["set-cookie"]) {
      res.setHeader("Set-Cookie", response.headers["set-cookie"]);
    }

    if (response.headers?.["content-type"] && !response.headers["content-type"].includes("application/json")) {
      return res.status(response.status).set(response.headers).send(response.data);
    }

    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error(`${serviceName} gateway forwarding error:`, error.message);

    if (error.code === "ECONNREFUSED" || error.code === "ECONNRESET") {
      return res.status(503).json({
        success: false,
        message: `${serviceName} service is currently unreachable.`,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.message || `${serviceName} gateway error`,
    });
  }
};

module.exports = {
  buildUpstreamUrl,
  shouldForwardBody,
  proxyRequest,
};
