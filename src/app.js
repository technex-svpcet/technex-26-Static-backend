
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
// Railway normally forwards requests through a proxy.
// Keep this setting aligned with your deployment.
// For local development, avoid sending spoofed
// X-Forwarded-For headers to Express.

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
// WEBSITE REGISTRATION EVENTS
// ==========================================
// These nine events use the existing TECHNEX
// registration forms and backend.
//
// Do not add Unstop events here.

const ENABLED_EVENTS = new Set([
  "techquest",
  "overdrive",
  "coastalclash",
  "robosumo",
  "bizcon",
  "envision",
  "vortex",
  "designx",
  "gamerconquest",
]);

// ==========================================
// UNSTOP REGISTRATION LINKS
// ==========================================
// Only these four events redirect to Unstop.
//
// To change an Unstop link later,
// edit the corresponding URL below.

const UNSTOP_EVENTS = Object.freeze({
  hackathon:
    "https://unstop.com/p/hackathon-st-vincent-pallotti-college-of-engineering-and-technology-svpcet-nagpur-1820868",

  ctf:
    "https://unstop.com/p/apex-ctf-st-vincent-pallotti-college-of-engineering-and-technology-svpcet-nagpur-1820854",

  hackthehardware:
    "https://unstop.com/p/hack-the-hardware-st-vincent-pallotti-college-of-engineering-and-technology-svpcet-nagpur-1820851",

  agenticarena:
    "https://unstop.com/p/agentic-arena-st-vincent-pallotti-college-of-engineering-and-technology-svpcet-nagpur-1820895",
});

// ==========================================
// EVENT SLUG ALIASES
// ==========================================
// Only explicitly listed aliases are accepted.
//
// Incorrect event names will NOT be matched
// automatically and will return 404.

const EVENT_ALIASES = new Map([
  // TechQuest
  ["tech-quest", "techquest"],
  ["techquest-2k26", "techquest"],

  // Overdrive
  ["overdrive-9", "overdrive"],
  ["overdrive-9-0", "overdrive"],

  // Coastal Clash
  ["coastal-clash", "coastalclash"],

  // Robo Sumo
  ["robo-sumo", "robosumo"],

  // BizCon
  ["biz-con", "bizcon"],

  // Envision
  ["nvgen", "envision"],

  // DesignXStudio
  ["design-x", "designx"],
  ["designxstudio", "designx"],
  ["design-x-studio", "designx"],

  // Vortex
  ["vortex-valorant", "vortex"],

  // Gamer Conquest
  ["gamer-conquest", "gamerconquest"],
  ["gamer-conquest-3-0", "gamerconquest"],
  ["gamerconquest-3", "gamerconquest"],

  // Hackathon
  ["hackathon-2026", "hackathon"],

  // APEX CTF
  ["apex-ctf", "ctf"],
  ["apexctf", "ctf"],

  // Hack the Hardware
  ["hack-the-hardware", "hackthehardware"],
  ["hack-the-hardware-2026", "hackthehardware"],

  // Agentic Arena
  ["agentic-arena", "agenticarena"],
  ["agentic-ai", "agenticarena"],
  ["agenticai", "agenticarena"],
]);

// ==========================================
// EVENT SLUG RESOLVER
// ==========================================

function resolveEvent(slug) {
  const normalized = String(slug || "")
    .trim()
    .toLowerCase();

  return EVENT_ALIASES.get(normalized) || normalized;
}

function isWebsiteEvent(event) {
  return ENABLED_EVENTS.has(event);
}

function isUnstopEvent(event) {
  return Object.prototype.hasOwnProperty.call(
    UNSTOP_EVENTS,
    event
  );
}

// ==========================================
// REGISTRATION RATE LIMITING
// ==========================================
// Preserve your existing rate limit.

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
// REGISTRATION API SECURITY
// ==========================================
// Only enabled website events can submit.
//
// The existing registration controller
// expects a canonical event slug.
//
// We therefore reject aliases for POST,
// instead of trying to modify req.params
// across different Express routers.

app.use("/api/register", (req, res, next) => {
  const match = /^\/([a-z0-9-]+)\/?$/i.exec(
    req.path
  );

  if (!match) {
    return res.status(404).json({
      success: false,
      message: "Registration endpoint not found.",
    });
  }

  const submittedEvent = match[1].toLowerCase();
  const resolvedEvent = resolveEvent(submittedEvent);

  if (!isWebsiteEvent(resolvedEvent)) {
    return res.status(404).json({
      success: false,
      message: "Registration endpoint not found.",
    });
  }

  // Require the canonical slug for API requests.
  // Example:
  // /api/register/envision    -> allowed
  // /api/register/nvgen      -> 404
  //
  // Registration page aliases still work.

  if (submittedEvent !== resolvedEvent) {
    return res.status(404).json({
      success: false,
      message: "Registration endpoint not found.",
    });
  }

  next();
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
// Preserve the existing QR router.
//
// Restrict only event payment QR requests.
// Other API routes provided by the router
// remain unaffected.

app.use("/api/payment-qr/:event", (req, res, next) => {
  const submittedEvent = String(req.params.event)
    .toLowerCase();

  const resolvedEvent = resolveEvent(submittedEvent);

  if (
    !isWebsiteEvent(resolvedEvent) ||
    submittedEvent !== resolvedEvent
  ) {
    return res.status(404).json({
      success: false,
      message: "Payment QR endpoint not found.",
    });
  }

  next();
});

app.use("/api", dynamicPaymentQrRouter);

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
  return res.redirect(302, "/register/techquest");
});

// ==========================================
// EVENT REGISTRATION PAGES
// ==========================================

app.get("/register/:event", (req, res) => {
  const event = resolveEvent(req.params.event);

  res.setHeader("Cache-Control", "no-store");

  // ----------------------------------------
  // 1. UNSTOP EVENTS
  // ----------------------------------------
  // Redirect to the specific Unstop event.

  if (isUnstopEvent(event)) {
    return res.redirect(
      302,
      UNSTOP_EVENTS[event]
    );
  }

  // ----------------------------------------
  // 2. WEBSITE REGISTRATION EVENTS
  // ----------------------------------------
  // Keep the same HTML registration pages.

  if (isWebsiteEvent(event)) {
    const registrationFile = path.join(
      pub,
      "Registrataion",
      `${event}.html`
    );

    return res.sendFile(registrationFile);
  }

  // ----------------------------------------
  // 3. INVALID EVENT URL
  // ----------------------------------------
  // No coming-soon page.
  // No Unstop fallback.
  // No automatic event-name guessing.

  return res.status(404).json({
    message: "Page not found.",
  });
});

// ==========================================
// WORKSHOP PAYMENT QR
// ==========================================
// Preserve your existing workshop QR route.

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
// Preserve existing asset access while
// blocking direct HTML access.

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

    if (/\.html?\/?$/i.test(decodedPath)) {
      return res.status(404).json({
        message: "Page not found.",
      });
    }

    const normalizedPath = path.posix.normalize(
      decodedPath.replace(/\\/g, "/")
    );

    if (
      /^\/?Registrataion(?:\/|$)/i.test(
        normalizedPath
      )
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
  const server = app.listen(
    port,
    "0.0.0.0",
    () => {
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
      console.log(" Website Registration Events");
      console.log("------------------------------------");

      for (const event of ENABLED_EVENTS) {
        console.log(`/register/${event}`);
      }

      console.log("------------------------------------");
      console.log(" Unstop Registration Redirects");
      console.log("------------------------------------");

      for (const event of Object.keys(UNSTOP_EVENTS)) {
        console.log(
          `/register/${event} -> ${UNSTOP_EVENTS[event]}`
        );
      }

      console.log("------------------------------------");
      console.log(" Dynamic Payment QR");
      console.log("------------------------------------");

      console.log(
        "/api/payment-qr/:event?teamSize=N"
      );

      console.log("------------------------------------");
      console.log("Health Check: /health");
      console.log("====================================");
      console.log("");
    }
  );

  server.on("error", (error) => {
    console.error(
      "Server startup failed:",
      error.message
    );

    process.exit(1);
  });

  // ========================================
  // GRACEFUL SHUTDOWN
  // ========================================

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
