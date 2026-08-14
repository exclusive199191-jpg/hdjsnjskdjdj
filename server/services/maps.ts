import { ProviderError } from "./breachApis";

const GOOGLE_STREET_VIEW_URL = "https://maps.googleapis.com/maps/api/streetview";

export function isGoogleMapsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}

export async function fetchStreetViewImage(params: {
  latitude: number;
  longitude: number;
  heading: number;
}): Promise<{ body: Buffer; contentType: string }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    throw new ProviderError(
      "Street View image previews require the GOOGLE_MAPS_API_KEY secret.",
      503,
      "GOOGLE_MAPS_API_KEY_REQUIRED",
    );
  }

  const query = new URLSearchParams({
    size: "800x450",
    location: `${params.latitude},${params.longitude}`,
    fov: "90",
    heading: String(params.heading),
    pitch: "0",
    return_error_code: "true",
    key: apiKey,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${GOOGLE_STREET_VIEW_URL}?${query}`, {
      signal: controller.signal,
      headers: { "user-agent": "bothost-location-preview/1.0" },
    });
    if (!response.ok) {
      throw new ProviderError(
        response.status === 404
          ? "Google Street View has no image coverage for these coordinates."
          : "Google Street View could not return an image.",
        response.status === 404 ? 404 : 502,
        response.status === 404 ? "STREET_VIEW_NOT_FOUND" : "STREET_VIEW_REQUEST_FAILED",
      );
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    return { body: Buffer.from(await response.arrayBuffer()), contentType };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if ((error as Error)?.name === "AbortError") {
      throw new ProviderError("Google Street View timed out. Try again.", 504, "STREET_VIEW_TIMEOUT");
    }
    throw new ProviderError("Google Street View is unavailable right now.", 502, "STREET_VIEW_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}