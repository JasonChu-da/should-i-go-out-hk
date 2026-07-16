import { notFound } from "next/navigation";
import { WeatherScenePreview } from "@/components/weather-scene/WeatherScenePreview";

export default function ScenePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <WeatherScenePreview />;
}
