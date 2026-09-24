"""Identify and remove only PlayBound test processes orphaned by spawn audits.

Dry run by default. The operator must inspect the PID/command list before
passing --apply. Never signal a process group: older recipes can inherit the
game-host agent's group.
"""

import argparse
import os
import signal
from pathlib import Path


def process_table():
    rows = {}
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            pid = int(entry.name)
            raw = (entry / 'cmdline').read_bytes()
            if not raw:
                continue
            command = raw.replace(b'\0', b' ').decode('utf-8', 'replace').strip()
            stat = (entry / 'stat').read_text()
            fields = stat[stat.rfind(')') + 2:].split()
            rows[pid] = (int(fields[1]), fields[19], command)  # parent, start ticks, command
        except (OSError, ValueError, IndexError):
            continue
    return rows


def targets(rows):
    selected = {pid for pid, (_, _, command) in rows.items()
                if 'PlayBound test ' in command and '/opt/playbound-host/games/' in command}
    while True:
        children = {pid for pid, (parent, _, _) in rows.items() if parent in selected}
        if children <= selected:
            return selected
        selected |= children


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--kill', action='store_true', help='Use SIGKILL for audit processes that ignored SIGTERM')
    args = parser.parse_args()
    rows = process_table()
    selected = targets(rows)
    for pid in sorted(selected):
        print(f'{pid}: {rows[pid][2]}')
    print(f'{len(selected)} audit processes; apply={args.apply}')
    if not args.apply:
        return
    for pid in sorted(selected, reverse=True):
        parent, start_ticks, _ = rows[pid]
        current = process_table().get(pid)
        if not current or current[:2] != (parent, start_ticks):
            continue  # PID was reused
        os.kill(pid, signal.SIGKILL if args.kill else signal.SIGTERM)


if __name__ == '__main__':
    main()
