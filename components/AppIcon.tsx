export type AppIconName =
  | "air"
  | "alert"
  | "bicycle"
  | "check"
  | "chevron"
  | "close"
  | "database"
  | "help"
  | "laundry"
  | "location"
  | "rain"
  | "sun"
  | "thermometer"
  | "walk";

interface AppIconProps {
  name: AppIconName;
  className?: string;
}

export function AppIcon({ name, className }: AppIconProps) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "air":
      return <svg {...common}><path d="M4 8h9.5a2.5 2.5 0 1 0-2.3-3.5"/><path d="M4 12h14a2 2 0 1 1-1.8 2.9"/><path d="M4 16h7"/></svg>;
    case "alert":
      return <svg {...common}><path d="M10.3 4.2 2.8 17.1A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.9L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 16.5h.01"/></svg>;
    case "bicycle":
      return <svg {...common}><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="m6 17 4-7 3 7h5l-4-7h-4"/><path d="m14 7 2 0"/></svg>;
    case "check":
      return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
    case "chevron":
      return <svg {...common}><path d="m7 10 5 5 5-5"/></svg>;
    case "close":
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
    case "database":
      return <svg {...common}><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>;
    case "help":
      return <svg {...common}><path d="M9.5 9a2.7 2.7 0 1 1 4.4 2.1c-1.3 1-1.9 1.4-1.9 2.9"/><path d="M12 18h.01"/></svg>;
    case "laundry":
      return <svg {...common}><path d="M4 5h16"/><path d="M7 5c0 3 1.7 5 5 5s5-2 5-5"/><path d="M8 10v8h8v-8"/></svg>;
    case "location":
      return <svg {...common}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
    case "rain":
      return <svg {...common}><path d="M7 16.5a4.5 4.5 0 0 1 .8-8.9A5.5 5.5 0 0 1 18.5 10a3.5 3.5 0 0 1-1 6.8"/><path d="m9 17-1 3M13 17l-1 3M17 17l-1 3"/></svg>;
    case "sun":
      return <svg {...common}><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
    case "thermometer":
      return <svg {...common}><path d="M9 14.8V5a3 3 0 0 1 6 0v9.8a5 5 0 1 1-6 0Z"/><path d="M12 7v9"/></svg>;
    case "walk":
      return <svg {...common}><circle cx="13" cy="4" r="2"/><path d="m10 21 2-7-3-3 2-4 4 3 3 1"/><path d="m12 14 4 3 1 4M9 11l-3 4"/></svg>;
  }
}
