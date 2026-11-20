
const EVENTS = Object.freeze({
  techquest: {
    min: 2,
    max: 5,
    fee: 50,
    type: "perParticipant",
  },

  overdrive: {
    min: 2,
    max: 4,
    fee: 450,
    type: "perTeam",
  },

  coastalclash: {
    min: 1,
    max: 4,
    fee: 399,
    type: "perTeam",
  },

  robosumo: {
    min: 1,
    max: 4,
    fee: 500,
    type: "perTeam",
  },

  bizcon: {
    min: 2,
    max: 4,
    fees: {
      2: 299,
      3: 349,
      4: 399,
    },
    type: "tiered",
  },

  designx: {
    min: 1,
    max: 1,
    fee: 200,
    type: "perTeam",
    challenges: ["revit", "fusion"],
  },

  vortex: {
    min: 5,
    max: 5,
    fee: 500,
    type: "perTeam",
  },
});

function getPrice(event, teamSize, challenge) {
  const slug = String(event || "").trim().toLowerCase();
  const cfg = Object.prototype.hasOwnProperty.call(
    EVENTS,
    slug
  )
    ? EVENTS[slug]
    : null;

  const size = Number(teamSize);

  if (
    !cfg ||
    !Number.isInteger(size) ||
    size < cfg.min ||
    size > cfg.max
  ) {
    throw new Error("Invalid event or team size");
  }

  // DesignX QR requests may omit the challenge.
  // Validate it when explicitly provided.
  if (
    cfg.challenges &&
    challenge !== undefined &&
    !cfg.challenges.includes(challenge)
  ) {
    throw new Error("Invalid DesignX challenge");
  }

  let amount;

  if (cfg.type === "tiered") {
    amount = cfg.fees[size];
  } else if (cfg.type === "perParticipant") {
    amount = cfg.fee * size;
  } else if (cfg.type === "perTeam") {
    amount = cfg.fee;
  } else {
    throw new Error("Invalid event pricing configuration");
  }

  if (
    !Number.isSafeInteger(amount) ||
    amount < 0
  ) {
    throw new Error("Invalid registration amount");
  }

  return amount;
}

module.exports = { EVENTS, getPrice };
