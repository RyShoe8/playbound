"use client";

import { useTelemetry } from "@/lib/telemetry";
import type { TelemetryEventName, TelemetryEventProps } from "@/lib/telemetry";

type Props<E extends TelemetryEventName> = {
  href: string;
  event: E;
  properties?: TelemetryEventProps<E>;
  className?: string;
  target?: string;
  rel?: string;
  children: React.ReactNode;
};

/** External (or any) anchor that tracks a catalog event on click. */
export function TelemetryAnchor<E extends TelemetryEventName>({
  href,
  event,
  properties,
  className,
  target,
  rel,
  children,
}: Props<E>) {
  const { track } = useTelemetry();

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={className}
      onClick={() => {
        void track(event, properties);
      }}
    >
      {children}
    </a>
  );
}
