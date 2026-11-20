
require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { registrationRouter } = require("./routes/formRoutes");
const dynamicPaymentQrRouter = require("./routes/dynamicPaymentQr");

const app = express();

// ==========================================
// RAILWAY PROXY CONFIGURATION
// ==========================================

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// ==========================================
// SECURITY CONFIGURATION
// ==========================================

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(
  express.json({
    limit: "60kb",
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "60kb",
  })
);

// ==========================================
// PUBLIC DIRECTORY
// ==========================================

const pub = path.join(__dirname, "..", "public");

// ==========================================
// ENABLED REGISTRATION EVENTS
// ==========================================
// Only events with existing HTML forms are enabled.
//
// Vortex and DesignX are intentionally disabled.
// Enable them after adding their HTML files and
// configuring their registration controllers.

const ENABLED_EVENTS = new Set([
  "techquest",
  "overdrive",
  "coastalclash",
  "robosumo",
  "bizcon",
]);

// ==========================================
// EVENT SLUG ALIASES
// ==========================================

const EVENT_ALIASES = new Map([
  ["tech-quest", "techquest"],
  ["overdrive-9", "overdrive"],
  ["overdrive-9-0", "overdrive"],
  ["coastal-clash", "coastalclash"],
  ["robo-sumo", "robosumo"],
  ["biz-con", "bizcon"],

  // Reserved for future registration pages
  ["design-x", "designx"],
  ["designxstudio", "designx"],
  ["vortex-valorant", "vortex"],
]);

// ==========================================
// EXTERNAL REGISTRATION URL
// ==========================================

const EXTERNAL_REGISTRATION_URL =
  "https://unstop.com/";

// ==========================================
// REGISTRATION RATE LIMITING
// ==========================================

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 10,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many registration attempts. Try again after 15 minutes.",
  },
});

// ==========================================
// REGISTRATION API
// ==========================================

app.use(
  "/api/register",
  limiter,
  registrationRouter
);

// ==========================================
// DYNAMIC EVENT PAYMENT QR
// ==========================================
// The dynamicPaymentQr router handles:
// GET /api/payment-qr/:event?teamSize=2
//
// The eventPricing module must calculate the
// official amount on the backend.
//
// Example:
// /api/payment-qr/bizcon?teamSize=2
// /api/payment-qr/bizcon?teamSize=3
// /api/payment-qr/techquest?teamSize=4

app.use(
  "/api",
  dynamicPaymentQrRouter
);

// ==========================================
// HEALTH CHECK - RAILWAY
// ==========================================

app.get("/health", (req, res) => {
  return res.status(200).json({
    ok: true,
    service: "TECHNEX registrations",
  });
});

// ==========================================
// DEFAULT PAGE
// ==========================================

app.get("/", (req, res) => {
  return res.redirect("/register/techquest");
});

// ==========================================
// EVENT REGISTRATION PAGES
// ==========================================

app.get("/register/:event", (req, res) => {
  const slug = req.params.event
    .toLowerCase()
    .trim();

  const event = EVENT_ALIASES.get(slug) || slug;

  res.setHeader("Cache-Control", "no-store");

  // Only serve enabled registration forms.

  if (ENABLED_EVENTS.has(event)) {
    return res.sendFile(
      path.join(
        pub,
        "Registrataion",
        `${event}.html`
      )
    );
  }

  // Events without an enabled registration
  // form continue to redirect to Unstop.

  return res.redirect(
    302,
    EXTERNAL_REGISTRATION_URL
  );
});

// ==========================================
// OLD STATIC EVENT QR REMOVED
// ==========================================
// The previous GET /api/payment-qr endpoint
// has been removed.
//
// New endpoint:
// GET /api/payment-qr/:event?teamSize=N
//
// Do not delete the old JPG until all existing
// registration forms use the new endpoint.

// ==========================================
// WORKSHOP PAYMENT QR
// ==========================================
// This route remains unchanged.

app.get("/api/workshop-payment-qr", (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  return res.sendFile(
    path.join(
      pub,
      "workshops",
      "technex-payment.jpg"
    )
  );
});

// ==========================================
// REGISTRATION SUCCESS PAGE
// ==========================================

app.get("/registration-success", (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  return res.sendFile(
    path.join(
      pub,
      "Landing pages",
      "registration-success.html"
    )
  );
});

// ==========================================
// STATIC ASSETS SECURITY
// ==========================================

app.use(
  "/assets",

  (req, res, next) => {
    let decodedPath;

    try {
      decodedPath = decodeURIComponent(req.path);
    } catch {
      return res.status(400).json({
        message: "Invalid asset path.",
      });
    }

    // Prevent direct access to HTML files.

    if (/\.html?\/?$/i.test(decodedPath)) {
      return res.status(404).json({
        message: "Page not found.",
      });
    }

    const normalizedPath = path.posix.normalize(
      decodedPath.replace(/\\/g, "/")
    );

    // Prevent direct access to registration directory.

    if (
      /^\/?Registrataion(?:\/|$)/i.test(normalizedPath)
    ) {
      return res.status(404).json({
        message: "Page not found.",
      });
    }

    return next();
  },

  express.static(pub, {
    index: false,
    dotfiles: "deny",
    redirect: false,
  })
);

// ==========================================
// UNKNOWN ROUTES
// ==========================================

app.use((req, res) => {
  return res.status(404).json({
    message: "Page or API endpoint not found.",
  });
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use((err, req, res, next) => {
  console.error("Request failed:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  const candidate = err.status || err.statusCode;

  const status =
    Number.isInteger(candidate) &&
    candidate >= 400 &&
    candidate <= 599
      ? candidate
      : 500;

  return res.status(status).json({
    success: false,
    message:
      status < 500
        ? "Invalid request or requested resource unavailable."
        : "Registration could not be processed. Please try again.",
  });
});

// ==========================================
// START SERVER - RAILWAY COMPATIBLE
// ==========================================

const port = Number(process.env.PORT) || 8080;

if (require.main === module) {
  const server = app.listen(port, "0.0.0.0", () => {
    console.log("");
    console.log("====================================");
    console.log(" TECHNEX 2026 Registration Server");
    console.log("====================================");

    console.log(
      `Environment: ${
        process.env.NODE_ENV || "development"
      }`
    );

    console.log(`Port: ${port}`);
    console.log("Server started successfully.");

    console.log("------------------------------------");
    console.log(" Available Registration Routes");
    console.log("------------------------------------");

    console.log("/register/techquest");
    console.log("/register/overdrive");
    console.log("/register/coastalclash");
    console.log("/register/robosumo");
    console.log("/register/bizcon");

    console.log("------------------------------------");
    console.log(" Dynamic Payment QR");
    console.log("------------------------------------");

    console.log(
      "/api/payment-qr/:event?teamSize=N"
    );

    console.log("------------------------------------");

    console.log(
      "Other events redirect to:",
      EXTERNAL_REGISTRATION_URL
    );

    console.log("Health Check: /health");

    console.log("====================================");
    console.log("");
  });

  // Handle server startup errors.

  server.on("error", (error) => {
    console.error(
      "Server startup failed:",
      error.message
    );

    process.exit(1);
  });

  // Graceful shutdown for Railway deployments.

  function shutdown(signal) {
    console.log(
      `${signal} received. Shutting down...`
    );

    const timeout = setTimeout(() => {
      console.error("Shutdown timed out.");
      process.exit(1);
    }, 10000);

    timeout.unref();

    server.close(() => {
      clearTimeout(timeout);
      console.log("Server closed successfully.");
      process.exit(0);
    });
  }

  process.once("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  process.once("SIGINT", () => {
    shutdown("SIGINT");
  });
}

module.exports = app;
