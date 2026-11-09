"""Read-only controller diagnostics using the same SDL2 DLL as the game.

Run with --dll PATH --device 0 --seconds 30. Leave controls untouched during
the two-second warmup, then exercise one named control at a time. Output uses
zero-based SDL indices; it does not infer physical labels or write bindings.
"""

import argparse
import ctypes as c
import json
import os
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dll", required=True)
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--seconds", type=int, default=30)
    args = parser.parse_args()
    if not 1 <= args.seconds <= 60 or args.device < 0:
        parser.error("Use a nonnegative device index and 1–60 seconds")
    os.environ["SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS"] = "1"
    sdl = c.CDLL(os.path.abspath(args.dll))
    signatures = {
        "SDL_Init": ([c.c_uint32], c.c_int),
        "SDL_GetError": ([], c.c_char_p),
        "SDL_NumJoysticks": ([], c.c_int),
        "SDL_JoystickOpen": ([c.c_int], c.c_void_p),
        "SDL_JoystickName": ([c.c_void_p], c.c_char_p),
        "SDL_JoystickNumAxes": ([c.c_void_p], c.c_int),
        "SDL_JoystickNumButtons": ([c.c_void_p], c.c_int),
        "SDL_JoystickNumHats": ([c.c_void_p], c.c_int),
        "SDL_JoystickGetAxis": ([c.c_void_p, c.c_int], c.c_int16),
        "SDL_JoystickGetButton": ([c.c_void_p, c.c_int], c.c_uint8),
        "SDL_JoystickGetHat": ([c.c_void_p, c.c_int], c.c_uint8),
        "SDL_JoystickGetAttached": ([c.c_void_p], c.c_int),
        "SDL_JoystickClose": ([c.c_void_p], None),
        "SDL_PumpEvents": ([], None),
        "SDL_JoystickUpdate": ([], None),
        "SDL_Quit": ([], None),
    }
    for name, (arguments, result) in signatures.items():
        function = getattr(sdl, name)
        function.argtypes, function.restype = arguments, result
    if sdl.SDL_Init(0x200) != 0:
        raise RuntimeError(sdl.SDL_GetError().decode(errors="replace"))
    joystick = None
    try:
        if args.device >= sdl.SDL_NumJoysticks():
            raise RuntimeError("Selected controller is not connected")
        joystick = sdl.SDL_JoystickOpen(args.device)
        if not joystick:
            raise RuntimeError(sdl.SDL_GetError().decode(errors="replace"))
        counts = [sdl.SDL_JoystickNumAxes(joystick),
                  sdl.SDL_JoystickNumButtons(joystick),
                  sdl.SDL_JoystickNumHats(joystick)]
        print(json.dumps({"device": sdl.SDL_JoystickName(joystick).decode(errors="replace"),
                          "axes": counts[0], "buttons": counts[1], "hats": counts[2],
                          "status": "warming up; leave controls untouched"}), flush=True)

        def read():
            sdl.SDL_PumpEvents()
            sdl.SDL_JoystickUpdate()
            if not sdl.SDL_JoystickGetAttached(joystick):
                raise RuntimeError("Controller disconnected during sampling")
            return [[getter(joystick, i) for i in range(count)] for getter, count in zip(
                [sdl.SDL_JoystickGetAxis, sdl.SDL_JoystickGetButton, sdl.SDL_JoystickGetHat], counts)]

        warmup = time.monotonic() + 2
        while time.monotonic() < warmup:
            read()
            time.sleep(0.02)
        previous = read()
        minimum, maximum = previous[0][:], previous[0][:]
        print(json.dumps({"status": "ready", "initial": previous}), flush=True)
        started = time.monotonic()
        while time.monotonic() - started < args.seconds:
            current = read()
            changes = {}
            for i, value in enumerate(current[0]):
                minimum[i], maximum[i] = min(minimum[i], value), max(maximum[i], value)
                if abs(value - previous[0][i]) >= 4096:
                    changes[f"axis:{i}"] = value
                    previous[0][i] = value
            for group, label in [(1, "button"), (2, "hat")]:
                for i, value in enumerate(current[group]):
                    if value != previous[group][i]:
                        changes[f"{label}:{i}"] = value
                previous[group] = current[group]
            if changes:
                print(json.dumps({"seconds": round(time.monotonic() - started, 2), **changes}), flush=True)
            time.sleep(0.02)
        print(json.dumps({"axisRanges": list(zip(minimum, maximum))}), flush=True)
    finally:
        if joystick:
            sdl.SDL_JoystickClose(joystick)
        sdl.SDL_Quit()


if __name__ == "__main__":
    main()
