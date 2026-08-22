/**
 * Input profile registry — ship standard + touch; reserve ids for later.
 */

"use strict";

const SHIPPED = {
  "standard-gamepad": {
    id: "standard-gamepad",
    label: "Standard Gamepad",
    capture: "gamepad-api",
  },
  "touch-gamepad": {
    id: "touch-gamepad",
    label: "Touch Gamepad",
    capture: "touch",
  },
};

const RESERVED = [
  "racing-wheel",
  "golf-swing",
  "tilt-steering",
  "party-buttons",
  "twin-stick",
  "pointer",
];

function isShipped(id) {
  return Boolean(SHIPPED[id]);
}

module.exports = { SHIPPED, RESERVED, isShipped };
