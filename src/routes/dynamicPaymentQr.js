
const express = require("express");
const QRCode = require("qrcode");
const { getPrice } = require("../config/eventPricing");

const router = express.Router();

router.get("/payment-qr/:event", async (req, res) => {
  try {
    const { event } = req.params;
    const { teamSize, challenge } = req.query;

    const amount = getPrice(event, teamSize, challenge);

    const upiId = process.env.TECHNEX_UPI_ID;
    const upiName = process.env.TECHNEX_UPI_NAME;

    if (!upiId || !upiName) {
      return res.status(503).json({
        success: false,
        message: "Payment account is not configured"
      });
    }

    const params = new URLSearchParams({
      pa: upiId,
      pn: upiName,
      am: amount.toFixed(2),
      cu: "INR",
      tn: `TECHNEX ${event} registration`
    });

    const upiUrl = `upi://pay?${params.toString()}`;

    const qr = await QRCode.toBuffer(upiUrl, {
      type: "png",
      width: 350,
      margin: 2,
      errorCorrectionLevel: "M"
    });

    res.set({
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });

    return res.send(qr);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
