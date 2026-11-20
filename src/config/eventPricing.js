
const EVENTS = Object.freeze({
  techquest: { min: 2, max: 5, fee: 50, type: "perParticipant" },
  overdrive: { min: 2, max: 4, fee: 450, type: "perTeam" },
  coastalclash: { min: 1, max: 4, fee: 399, type: "perTeam" },
  robosumo: { min: 1, max: 4, fee: 500, type: "perTeam" },
  bizcon: {
    min: 2, max: 4,
    fees: { 2: 299, 3: 349, 4: 399 },
    type: "tiered"
  },
  designx: {
    min: 1, max: 2,
    fee: 200,
    type: "perTeam",
    challenges: ["revit", "fusion"]
  }
  // Add vortex after confirming its official fee.
});

function getPrice(event, teamSize, challenge) {
  const cfg = EVENTS[event];
  const size = Number(teamSize);

  if (!cfg || !Number.isInteger(size) ||
      size < cfg.min || size > cfg.max) {
    throw new Error("Invalid event or team size");
  }

  if (cfg.challenges && !cfg.challenges.includes(challenge)) {
    throw new Error("Invalid DesignX challenge");
  }

  const amount = cfg.type === "tiered"
    ? cfg.fees[size]
    : cfg.type === "perParticipant"
      ? cfg.fee * size
      : cfg.fee;

  return amount;
}

module.exports = { EVENTS, getPrice };
