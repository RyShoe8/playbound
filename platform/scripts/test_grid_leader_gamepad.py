"""Run with a Python environment containing Panda3D 1.10.16."""

import unittest
from types import SimpleNamespace

from panda3d.core import GamepadButton, InputDevice

from grid_leader_gamepad import PlayBoundGamepad


class FakePad:
    def __init__(self):
        self.axes = {}
        self.buttons = set()

    def findAxis(self, axis):
        return SimpleNamespace(known=axis in self.axes, value=self.axes.get(axis, 0.0))

    def findButton(self, button):
        return SimpleNamespace(pressed=button in self.buttons)


class GamepadTests(unittest.TestCase):
    def setUp(self):
        self.pad = FakePad()
        self.connected = [self.pad]
        self.attached = []
        self.detached = []
        self.keyboard = SimpleNamespace(
            keyMap={key: 0 for key in ("accelerate", "brake", "left", "right", "space", "p")},
            padMap={key: 0 for key in ("accelerate", "brake", "left", "right", "space", "p")},
        )
        devices = SimpleNamespace(getDevices=lambda device_class: self.connected)
        base = SimpleNamespace(
            devices=devices,
            attachInputDevice=lambda device, prefix: self.attached.append((device, prefix)),
            detachInputDevice=lambda device: self.detached.append(device),
        )
        task_manager = SimpleNamespace(add=lambda callback, name: None)
        self.adapter = PlayBoundGamepad(self.keyboard, base, task_manager)
        self.task = SimpleNamespace(cont="continue")

    def tick(self):
        self.assertEqual(self.adapter.update(self.task), "continue")

    def test_stick_triggers_and_dpad_drive_separate_pad_state(self):
        self.keyboard.keyMap["right"] = 1
        self.pad.axes[InputDevice.Axis.left_x] = -0.8
        self.pad.axes[InputDevice.Axis.right_trigger] = 0.7
        self.pad.buttons.add(GamepadButton.dpad_right())
        self.tick()
        self.assertEqual(self.keyboard.padMap["left"], 1)
        self.assertEqual(self.keyboard.padMap["right"], 1)
        self.assertEqual(self.keyboard.padMap["accelerate"], 1)
        self.assertEqual(self.keyboard.keyMap["right"], 1)
        self.assertEqual(self.attached, [(self.pad, "gridpad")])

    def test_a_and_start_are_one_shot_and_disconnect_releases_controls(self):
        self.pad.buttons.update((GamepadButton.face_a(), GamepadButton.start()))
        self.tick()
        self.assertEqual(self.keyboard.padMap["space"], 1)
        self.assertEqual(self.keyboard.padMap["p"], 1)
        self.keyboard.padMap["space"] = 0
        self.keyboard.padMap["p"] = 0
        self.tick()
        self.assertEqual(self.keyboard.padMap["space"], 0)
        self.assertEqual(self.keyboard.padMap["p"], 0)
        self.pad.buttons.clear()
        self.tick()
        self.pad.buttons.add(GamepadButton.face_a())
        self.tick()
        self.assertEqual(self.keyboard.padMap["space"], 1)
        self.connected.clear()
        self.tick()
        self.assertTrue(all(value == 0 for value in self.keyboard.padMap.values()))
        self.assertEqual(self.detached, [self.pad])


if __name__ == "__main__":
    unittest.main()
