
const express = require("express");
const QRCode = require("qrcode");
const { getPrice } = require("../config/eventPricing");

const router = express.Router();

const qrCache = new Map();
const MAX_CACHE_ENTRIES = 100;

router.get("/payment-qr/:event", async (req, res) => {
  try {
    const event = String(req.params.event || "")
      .trim()
      .toLowerCase();

    const { teamSize, challenge } = req.query;

    // Official fee is calculated by the backend.
    const amount = getPrice(event, teamSize, challenge);

    const upiId = process.env.TECHNEX_UPI_ID?.trim();
    const upiName = process.env.TECHNEX_UPI_NAME?.trim();

    if (!upiId || !upiName) {
      return res.status(503).json({
        success: false,
        message: "Payment account is not configured",
      });
    }

    if (amount === 0) {
      return res.status(400).json({
        success: false,
        message: "This event does not require payment",
      });
    }

    const cacheKey = JSON.stringify([
      event,
      amount,
      upiId,
      upiName,
    ]);

    let qr = qrCache.get(cacheKey);

    if (!qr) {
      const params = new URLSearchParams({
        pa: upiId,
        pn: upiName,
        am: amount.toFixed(2),
        cu: "INR",
        tn: `TECHNEX ${event} registration`,
      });

      const upiUrl = `upi://pay?${params.toString()}`;

      qr = await QRCode.toBuffer(upiUrl, {
        type: "png",
        width: 350,
        margin: 2,
        errorCorrectionLevel: "M",
      });

      if (qrCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = qrCache.keys().next().value;
        qrCache.delete(oldestKey);
      }

      qrCache.set(cacheKey, qr);
    }

    res.set({
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });

    return res.status(200).send(qr);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
