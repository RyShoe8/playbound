"""Native gamepad input for the PlayBound Grid Leader test build.

The original game reads KeyboardHandler's key map. Keep gamepad state in a
separate map so polling a pad never releases a key held on the keyboard.
"""

import ctypes
from functools import lru_cache
import os

from panda3d.core import GamepadButton, InputDevice


class _XInputGamepad(ctypes.Structure):
    _fields_ = [
        ("buttons", ctypes.c_ushort),
        ("left_trigger", ctypes.c_ubyte),
        ("right_trigger", ctypes.c_ubyte),
        ("left_x", ctypes.c_short),
        ("left_y", ctypes.c_short),
        ("right_x", ctypes.c_short),
        ("right_y", ctypes.c_short),
    ]


class _XInputState(ctypes.Structure):
    _fields_ = [("packet", ctypes.c_ulong), ("gamepad", _XInputGamepad)]


@lru_cache(maxsize=1)
def _xinput_get_state():
    if os.name != "nt":
        return None
    for library in ("xinput1_4", "xinput1_3", "xinput9_1_0"):
        try:
            get_state = getattr(ctypes.WinDLL(library), "XInputGetState")
            get_state.argtypes = (ctypes.c_ulong, ctypes.POINTER(_XInputState))
            get_state.restype = ctypes.c_ulong
            return get_state
        except (AttributeError, OSError):
            continue
    return None


def _xinput_triggers():
    """Read separate Windows triggers when a controller's HID axes are odd."""
    get_state = _xinput_get_state()
    if get_state is not None:
        for index in range(4):
            state = _XInputState()
            if get_state(index, ctypes.byref(state)) == 0:
                return state.gamepad.left_trigger / 255.0, state.gamepad.right_trigger / 255.0
    return 0.0, 0.0


class PlayBoundGamepad:
    def __init__(self, keyboard, game_base, task_manager, xinput_triggers=None):
        self.keyboard = keyboard
        self.base = game_base
        self.device = None
        self.previous_a = False
        self.previous_start = False
        self._warned = False
        self.frame = 0
        self.trigger_rest = {}
        self.xinput_triggers = xinput_triggers or _xinput_triggers
        task_manager.add(self.update, "playbound-gamepad")

    def _reset(self):
        for key in self.keyboard.padMap:
            self.keyboard.padMap[key] = 0
        self.keyboard.padSteering = 0.0
        self.previous_a = False
        self.previous_start = False

    @staticmethod
    def _axis(device, axis):
        state = device.findAxis(axis)
        return state.value if state and state.known else 0.0

    @staticmethod
    def _pressed(device, button):
        state = device.findButton(button)
        return bool(state and state.pressed)

    @staticmethod
    def _steering(raw):
        # Old game's digital steering accumulates each frame. Give the analog
        # stick a broad deadzone and a gentle curve before the driver smooths it.
        deadzone = 0.28
        magnitude = abs(raw)
        if magnitude <= deadzone:
            return 0.0
        shaped = ((min(magnitude, 1.0) - deadzone) / (1.0 - deadzone)) ** 1.7
        return shaped if raw > 0 else -shaped

    def _trigger(self, device, axis, button):
        state = device.findAxis(axis)
        if state.known:
            rest = self.trigger_rest.get(axis, 0.0)
            if abs(state.value - rest) > 0.12:
                return True
        return self._pressed(device, button)

    def update(self, task):
        try:
            self.frame += 1
            if self.device is None or not getattr(self.device, "connected", True) or self.frame % 60 == 0:
                devices = self.base.devices.getDevices(InputDevice.DeviceClass.gamepad)
                current = devices[0] if devices else None
            else:
                current = self.device
            if current != self.device:
                if self.device is not None:
                    self.base.detachInputDevice(self.device)
                self._reset()
                self.device = current
                if current is not None:
                    self.base.attachInputDevice(current, prefix="gridpad")
                    self.trigger_rest = {
                        axis: self._axis(current, axis)
                        for axis in (InputDevice.Axis.left_trigger, InputDevice.Axis.right_trigger)
                    }

            if current is None:
                return task.cont

            left_x = self._axis(current, InputDevice.Axis.left_x)
            self.keyboard.padSteering = self._steering(left_x)
            self.keyboard.padMap["left"] = int(self._pressed(current, GamepadButton.dpad_left()))
            self.keyboard.padMap["right"] = int(self._pressed(current, GamepadButton.dpad_right()))
            x_left, x_right = self.xinput_triggers()
            self.keyboard.padMap["accelerate"] = int(
                x_right > 0.08 or self._trigger(current, InputDevice.Axis.right_trigger, GamepadButton.rtrigger())
            )
            self.keyboard.padMap["brake"] = int(
                x_left > 0.08 or self._trigger(current, InputDevice.Axis.left_trigger, GamepadButton.ltrigger())
            )

            a = self._pressed(current, GamepadButton.face_a())
            start = self._pressed(current, GamepadButton.start())
            if a and not self.previous_a:
                self.keyboard.padMap["space"] = 1
            if start and not self.previous_start:
                self.keyboard.padMap["p"] = 1
            if not a:
                self.keyboard.padMap["space"] = 0
            if not start:
                self.keyboard.padMap["p"] = 0
            self.previous_a = a
            self.previous_start = start
        except Exception as exc:
            self._reset()
            if not self._warned:
                print("[PlayBound Grid Leader] Gamepad unavailable:", exc)
                self._warned = True
        return task.cont
