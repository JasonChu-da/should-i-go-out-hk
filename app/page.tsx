import OutlookApp from "@/components/OutlookApp";
import { hongKongWeatherPeriod } from "@/lib/weather-scene/hong-kong-period";

export const dynamic = "force-dynamic";

export default function Home() {
  const initialPeriod =
    hongKongWeatherPeriod(new Date().toISOString()) ?? "day";

  return <OutlookApp initialPeriod={initialPeriod} />;
}
