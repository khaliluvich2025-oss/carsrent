import {
  IconAlert,
  IconCalendar,
  IconCar,
  IconChart,
  IconClipboard,
  IconGauge,
  IconSettings,
  IconUsers,
  IconWrench,
} from "@/components/ui/icons";

const MAP = {
  gauge: IconGauge,
  clipboard: IconClipboard,
  calendar: IconCalendar,
  car: IconCar,
  users: IconUsers,
  alert: IconAlert,
  wrench: IconWrench,
  chart: IconChart,
  settings: IconSettings,
} as const;

export function NavIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Component = MAP[name as keyof typeof MAP] ?? IconGauge;
  return <Component size={size} />;
}
