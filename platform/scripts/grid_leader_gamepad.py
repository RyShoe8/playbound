"""Native gamepad input for the PlayBound Grid Leader test build.

The original game reads KeyboardHandler's key map. Keep gamepad state in a
separate map so polling a pad never releases a key held on the keyboard.
"""

from panda3d.core import GamepadButton, InputDevice


class PlayBoundGamepad:
    def __init__(self, keyboard, game_base, task_manager):
        self.keyboard = keyboard
        self.base = game_base
        self.device = None
        self.previous_a = False
        self.previous_start = False
        self._warned = False
        task_manager.add(self.update, "playbound-gamepad")

    def _reset(self):
        for key in self.keyboard.padMap:
            self.keyboard.padMap[key] = 0
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

    def update(self, task):
        try:
            devices = self.base.devices.getDevices(InputDevice.DeviceClass.gamepad)
            current = devices[0] if devices else None
            if current != self.device:
                if self.device is not None:
                    self.base.detachInputDevice(self.device)
                self._reset()
                self.device = current
                if current is not None:
                    self.base.attachInputDevice(current, prefix="gridpad")

            if current is None:
                return task.cont

            left_x = self._axis(current, InputDevice.Axis.left_x)
            self.keyboard.padMap["left"] = int(
                left_x < -0.22 or self._pressed(current, GamepadButton.dpad_left())
            )
            self.keyboard.padMap["right"] = int(
                left_x > 0.22 or self._pressed(current, GamepadButton.dpad_right())
            )
            self.keyboard.padMap["accelerate"] = int(
                self._axis(current, InputDevice.Axis.right_trigger) > 0.15
                or self._pressed(current, GamepadButton.rtrigger())
            )
            self.keyboard.padMap["brake"] = int(
                self._axis(current, InputDevice.Axis.left_trigger) > 0.15
                or self._pressed(current, GamepadButton.ltrigger())
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
