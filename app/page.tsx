"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { fetchAiWeatherAdvice } from "@/utils/ai";

interface WeatherData {
  current: {
    temp: number;
    feels_like: number;
    humidity: number;
    wind_speed: number;
    weather: { main: string; description: string }[];
  };
  hourly: {
    dt: number;
    main: { temp: number };
    weather: { main: string; description: string }[];
  }[];
  daily: {
    dt: number;
    temp: { day: number };
    weather: { main: string; description: string }[];
  }[];
  timezone: number;
}

interface GeoCodingLocation {
  lat: number;
  lon: number;
  name: string;
  state?: string;
  country: string;
}

interface ForecastEntry {
  dt: number;
  main: { temp: number };
  weather: { main: string; description: string }[];
}

interface ForecastApiResponse {
  cod: string;
  list: ForecastEntry[];
  city: { timezone?: number };
}

interface CurrentWeatherApiResponse {
  cod: number;
  main: { temp: number; feels_like: number; humidity: number };
  wind: { speed: number };
  weather: { main: string; description: string }[];
}

interface LocationOption {
  lat: number;
  lon: number;
  name: string;
  state?: string;
  country: string;
  label: string;
}

const formatLocationLabel = (location: { name: string; state?: string; country: string }) => {
  const segments = [location.name];
  if (location.state) {
    segments.push(location.state);
  }
  if (location.country && location.country !== "US") {
    segments.push(location.country);
  } else if (location.country === "US") {
    segments.push("USA");
  }
  return segments.join(", ");
};

const WeatherApp: React.FC = () => {
  const [locationQuery, setLocationQuery] = useState<string>("");
  const [locationResults, setLocationResults] = useState<LocationOption[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [aiAdvice, setAiAdvice] = useState<string>("");
  const [isAdviceLoading, setIsAdviceLoading] = useState<boolean>(false);
  const [currentHour, setCurrentHour] = useState<number | null>(null);

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const locationLookupIdRef = useRef(0);
  const skipNextLookupRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentHour(new Date().getHours());
    }
  }, []);

  const isNight = currentHour !== null ? currentHour >= 18 || currentHour < 6 : false;

  useEffect(() => {
    if (!weatherData) return;

    const description = weatherData.current.weather?.[0]?.description ?? "";
    const temperature = weatherData.current.temp;

    setIsAdviceLoading(true);
    setAiAdvice("");
    fetchAiWeatherAdvice(description, temperature)
      .then((advice) => {
        setAiAdvice(advice);
      })
      .catch(() => {
        setAiAdvice("No AI advice available right now. Try refreshing your forecast.");
      })
      .finally(() => setIsAdviceLoading(false));
  }, [weatherData]);

  const searchLocations = useCallback(
    async (
      query: string,
      { showErrors = false }: { showErrors?: boolean } = {}
    ): Promise<LocationOption[]> => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        if (showErrors) {
          setSearchError("Let’s start with a city name.");
        }
        setLocationResults([]);
        setIsSearching(false);
        return [];
      }

      const apiKey = process.env.NEXT_PUBLIC_WEATHER_API_KEY;
      if (!apiKey) {
        throw new Error("Missing NEXT_PUBLIC_WEATHER_API_KEY");
      }

      const requestId = ++locationLookupIdRef.current;

      setIsSearching(true);
      if (showErrors) {
        setSearchError(null);
      }

      try {
        const geoResponse = await fetch(
          `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
            trimmedQuery
          )}&limit=5&appid=${apiKey}`
        );
        const geoData: GeoCodingLocation[] = await geoResponse.json();

        if (requestId !== locationLookupIdRef.current) {
          return [];
        }

        if (!Array.isArray(geoData) || geoData.length === 0) {
          if (showErrors) {
            setWeatherData(null);
            setAiAdvice("Couldn’t find that location. Try a different spelling or add the state.");
            setSearchError("No matches found. Try adding a state abbreviation.");
          }
          setLocationResults([]);
          return [];
        }

        const usMatches = geoData.filter((entry) => entry.country === "US");
        const prioritized = usMatches.length ? usMatches : geoData;

        const options: LocationOption[] = prioritized.map((entry) => ({
          lat: entry.lat,
          lon: entry.lon,
          name: entry.name,
          state: entry.state,
          country: entry.country,
          label: formatLocationLabel(entry),
        }));

        setLocationResults(options);
        return options;
      } catch (error) {
        if (requestId !== locationLookupIdRef.current) {
          return [];
        }
        console.error("Error searching for location:", error);
        if (showErrors) {
          setSearchError("We couldn’t reach the location service. Please try again.");
        }
        return [];
      } finally {
        if (requestId === locationLookupIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const trimmedQuery = locationQuery.trim();

    if (skipNextLookupRef.current) {
      skipNextLookupRef.current = false;
      return;
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }

    if (!trimmedQuery) {
      locationLookupIdRef.current += 1;
      setLocationResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    if (selectedLocation && trimmedQuery === selectedLocation) {
      setLocationResults([]);
      setIsSearching(false);
      return;
    }

    if (trimmedQuery.length < 2) {
      locationLookupIdRef.current += 1;
      setLocationResults([]);
      setIsSearching(false);
      return;
    }

    searchDebounceRef.current = setTimeout(() => {
      void searchLocations(trimmedQuery);
    }, 350);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [locationQuery, selectedLocation, searchLocations]);

  const fetchWeatherByCoordinates = async (option: LocationOption) => {
    try {
      const apiKey = process.env.NEXT_PUBLIC_WEATHER_API_KEY;
      if (!apiKey) {
        throw new Error("Missing NEXT_PUBLIC_WEATHER_API_KEY");
      }

      setAiAdvice("Generating tailored guidance...");

      const currentResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${option.lat}&lon=${option.lon}&appid=${apiKey}&units=imperial`
      );
      const currentData: CurrentWeatherApiResponse = await currentResponse.json();

      if (!currentData || currentData.cod !== 200) {
        setWeatherData(null);
        setAiAdvice("We hit a snag fetching the current weather. Try again in a moment.");
        return;
      }

      const forecastResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${option.lat}&lon=${option.lon}&appid=${apiKey}&units=imperial`
      );
      const forecastData: ForecastApiResponse = await forecastResponse.json();

      if (!forecastData || forecastData.cod !== "200") {
        setWeatherData(null);
        setAiAdvice("We hit a snag fetching the forecast. Try again in a moment.");
        return;
      }

      const dailyDataMap: Record<
        string,
        { dt: number; temp: { day: number }; weather: { main: string; description: string }[] }
      > = {};

      forecastData.list.forEach((entry) => {
        const date = new Date(entry.dt * 1000).toISOString().split("T")[0];

        if (!dailyDataMap[date]) {
          dailyDataMap[date] = {
            dt: entry.dt,
            temp: { day: entry.main.temp },
            weather: entry.weather,
          };
        }
      });

      const dailyArray = Object.values(dailyDataMap).slice(1, 4);

      setWeatherData({
        current: {
          temp: currentData.main.temp,
          feels_like: currentData.main.feels_like,
          humidity: currentData.main.humidity,
          wind_speed: currentData.wind.speed,
          weather: currentData.weather,
        },
        hourly: forecastData.list.slice(0, 6),
        daily: dailyArray,
        timezone: forecastData.city.timezone ?? 0,
      });

      setSelectedLocation(option.label);
    } catch (error) {
      console.error("Error fetching weather data:", error);
      setAiAdvice("Something went wrong while reaching the weather service.");
      setWeatherData(null);
    }
  };

  const handleSelectLocation = (option: LocationOption) => {
    skipNextLookupRef.current = true;
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    locationLookupIdRef.current += 1;
    setIsSearching(false);

    setLocationQuery(option.label);
    setSearchError(null);
    setLocationResults([]);
    fetchWeatherByCoordinates(option);
  };

  const getBackgroundClass = (condition: string, night: boolean) => {
    if (night) {
      switch (condition) {
        case "Clear":
          return "aurora-theme-night-clear";
        case "Clouds":
          return "aurora-theme-night-clouds";
        case "Rain":
        case "Drizzle":
          return "aurora-theme-night-rain";
        case "Thunderstorm":
          return "aurora-theme-night-thunder";
        case "Snow":
          return "aurora-theme-night-snow";
        default:
          return "aurora-theme-night-base";
      }
    }

    switch (condition) {
      case "Clear":
        return "aurora-theme-day-clear";
      case "Clouds":
        return "aurora-theme-day-clouds";
      case "Rain":
      case "Drizzle":
        return "aurora-theme-day-rain";
      case "Thunderstorm":
        return "aurora-theme-day-thunder";
      case "Snow":
        return "aurora-theme-day-snow";
      default:
        return "aurora-theme-default";
    }
  };

  const getWeatherIcon = (condition: string, hour: number) => {
    const hourIsNight = hour >= 19 || hour < 7;

    const iconMap: Record<string, string> = {
      Clear: hourIsNight ? "/images/moon.svg" : "/images/clear.svg",
      Clouds: hourIsNight ? "/images/moon_clouds.svg" : "/images/clouds.svg",
      Mist: hourIsNight ? "/images/moon_mist.svg" : "/images/mist.svg",
      Rain: hourIsNight ? "/images/moon_rain.svg" : "/images/rain.svg",
      Snow: hourIsNight ? "/images/moon_snow.svg" : "/images/snow.svg",
      Thunderstorm: hourIsNight ? "/images/moon_thunder.svg" : "/images/thunder.svg",
      "Heavy Rain": hourIsNight ? "/images/moon_rain.svg" : "/images/moderate_heavy_rain.svg",
      "Thunder Rain": hourIsNight ? "/images/moon_thunder.svg" : "/images/thunder_rain.svg",
    };

    return iconMap[condition] || "/images/no-result.svg";
  };

  const [currentHourTime, setCurrentHourTime] = useState<number>(0);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentHourTime(new Date().getHours());
    }
  }, []);

  const handleSearch = async () => {
    const trimmedQuery = locationQuery.trim();
    if (!trimmedQuery) {
      setSearchError("Let’s start with a city name.");
      return;
    }
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    const options = await searchLocations(trimmedQuery, { showErrors: true });
    if (options.length === 1) {
      handleSelectLocation(options[0]);
    }
  };

  const activeAuroraClass =
    weatherData?.current?.weather?.[0]?.main && currentHour !== null
      ? getBackgroundClass(weatherData.current.weather[0].main, isNight)
      : "aurora-theme-default";

  const hasSuggestions = locationResults.length > 0;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
      <div className="aurora-container">
        <div className={`aurora-gradient ${activeAuroraClass}`} />
        <div className="aurora-glow aurora-glow-one" />
        <div className="aurora-glow aurora-glow-two" />
        <div className="aurora-noise" />
      </div>

      <div className="relative z-10">
        <nav className="sticky top-0 inset-x-0 z-30 w-full border-b border-white/10 bg-slate-950/75 px-4 py-6 shadow-lg backdrop-blur-2xl supports-[backdrop-filter]:bg-slate-950/55 sm:px-6 lg:px-8">
          <header
            className={`mx-auto flex max-w-7xl flex-col gap-6 sm:px-4 transition-all duration-300 ${
              hasSuggestions ? "pb-10" : ""
            }`}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Image src="/images/clear.svg" alt="Weather.io icon" width={36} height={36} />
                  <h1 className="text-3xl font-semibold tracking-tight text-white">Weather.io</h1>
                </div>
                <p className="max-w-xl text-sm text-slate-300">
                  Real-time forecasts blended with adaptive AI insights so you can decide what to do next with
                  confidence.
                </p>
              </div>

              <div
                className={`glass-card relative w-full max-w-xl px-5 py-5 shadow-2xl transition-all duration-300 ${
                  hasSuggestions ? "pb-16 sm:pb-20" : ""
                }`}
              >
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-center"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await handleSearch();
                  }}
                >
                  <div className="relative w-full">
                    <input
                      type="text"
                      placeholder="Search a city or add a state (e.g., “Augusta” or “Augusta, GA”)"
                      value={locationQuery}
                      onChange={(event) => {
                        if (searchError) {
                          setSearchError(null);
                        }
                        if (selectedLocation) {
                          setSelectedLocation("");
                        }
                        setLocationQuery(event.target.value);
                      }}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 pr-12 text-base text-white placeholder:text-slate-400 transition-all duration-200 focus:border-sky-300/60 focus:outline-none focus:ring-2 focus:ring-sky-300/30"
                    />
                    {isSearching && (
                      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs uppercase tracking-[0.35em] text-slate-300">
                        Searching…
                      </span>
                    )}

                    {locationResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-3 origin-top rounded-2xl border border-white/10 bg-slate-900/80 p-3 shadow-2xl backdrop-blur-2xl transition-all duration-200 ease-out">
                        <p className="px-1 text-xs uppercase tracking-[0.4em] text-slate-400">Choose a match</p>
                        <div className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">
                          {locationResults.map((option) => (
                            <button
                              key={`${option.lat}-${option.lon}`}
                              type="button"
                              onClick={() => handleSelectLocation(option)}
                              className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-white transition hover:border-sky-300/40 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/60"
                            >
                              <span>{option.label}</span>
                              <span className="text-xs uppercase tracking-[0.35em] text-slate-400">
                                {option.country === "US" ? "US" : option.country}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-sky-400/90 via-indigo-500/90 to-violet-500/90 px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60"
                  >
                    Search
                  </button>
                </form>

                {searchError && (
                  <p className="mt-3 text-xs font-medium text-rose-200/90">{searchError}</p>
                )}
              </div>
            </div>
          </header>
        </nav>

        <main className="mx-auto max-w-7xl px-6 pb-16 pt-10 sm:px-8 sm:pt-14">
          {!weatherData ? (
            <div className="glass-card px-10 py-14 text-center shadow-2xl">
              <p className="text-sm uppercase tracking-[0.45em] text-slate-400">Start exploring</p>
              <h2 className="mt-4 text-3xl font-semibold text-white">Experience the aurora forecast</h2>
              <p className="mt-4 text-base text-slate-300">
                Search for any U.S. city to unlock a glassy dashboard with AI-powered suggestions tailored to the
                skies.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
              <section className="space-y-6">
                <div className="glass-card overflow-hidden px-8 py-8 shadow-2xl">
                  <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-3">
                      <p className="text-xs uppercase tracking-[0.45em] text-slate-300/80">Current conditions</p>
                      <h2 className="text-4xl font-semibold text-white">
                        {selectedLocation || locationQuery || "Awaiting location"}
                      </h2>
                      <p className="text-lg capitalize text-slate-200">
                        {weatherData.current.weather[0].description}
                      </p>
                    </div>

                    <div className="flex items-center gap-6 lg:gap-10">
                      <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-white/5 backdrop-blur-xl">
                        <div className="absolute h-full w-full rounded-full bg-gradient-to-br from-white/5 to-white/0 opacity-60" />
                        <Image
                          src={getWeatherIcon(weatherData.current.weather[0].main, currentHourTime)}
                          alt="Weather Icon"
                          width={96}
                          height={96}
                          className="relative z-10"
                        />
                      </div>
                      <div className="text-right">
                        <p className="text-5xl font-semibold text-white" suppressHydrationWarning={true}>
                          {Math.round(weatherData.current.temp)}°F
                        </p>
                        <p className="text-sm text-slate-300" suppressHydrationWarning={true}>
                          Feels like {Math.round(weatherData.current.feels_like)}°F
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-10 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center backdrop-blur-xl">
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">Humidity</p>
                      <p className="mt-2 text-2xl font-semibold text-white" suppressHydrationWarning={true}>
                        {weatherData.current.humidity}%
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center backdrop-blur-xl">
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">Wind</p>
                      <p className="mt-2 text-2xl font-semibold text-white" suppressHydrationWarning={true}>
                        {Math.round(weatherData.current.wind_speed)} mph
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center backdrop-blur-xl">
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-300/70">Daylight</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {isNight ? "Nightfall" : "Daylight"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="glass-card px-8 py-6 shadow-2xl">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h3 className="text-lg font-semibold text-white">Today at a glance</h3>
                    <span className="text-xs uppercase tracking-[0.4em] text-slate-400">Next few hours</span>
                  </div>
                  <div className="mt-6 overflow-x-auto pb-2">
                    <div className="flex min-w-max gap-4">
                      {weatherData.hourly.slice(0, 6).map((hour, index) => {
                        const hourTime = new Date(hour.dt * 1000).getHours();
                        const displayTime = new Date(hour.dt * 1000).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        });

                        return (
                          <div
                            key={`${hour.dt}-${index}`}
                            className="min-w-[140px] rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-center backdrop-blur-xl"
                          >
                            <p className="text-xs uppercase tracking-[0.35em] text-slate-300/80">{displayTime}</p>
                            <div className="my-3 flex justify-center">
                              <Image
                                src={getWeatherIcon(hour.weather[0].main, hourTime)}
                                alt="Weather Icon"
                                width={42}
                                height={42}
                              />
                            </div>
                            <p className="text-xl font-semibold text-white">
                              {Math.round(hour.main.temp)}°F
                            </p>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                              {hour.weather[0].main}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="glass-card px-8 py-6 shadow-2xl">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-white">Next few days</h3>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">72 hour outlook</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white">
                      3-day
                    </span>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {weatherData?.daily?.length ? (
                      weatherData.daily.map((day, index) => {
                        if (!day.temp || !day.weather?.length) return null;

                        const localDate = new Date((day.dt + weatherData.timezone) * 1000);
                        const dayHourTime = localDate.getHours();
                        const dayName = localDate.toLocaleDateString("en-US", { weekday: "long" });
                        const dayStamp = localDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        });
                        const tempScore = Math.min(100, Math.max(35, (day.temp.day / 110) * 100));

                        return (
                          <div
                            key={`${day.dt}-${index}`}
                            className="group flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-sky-200/50 hover:bg-white/10 hover:shadow-2xl"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.35em] text-slate-300/90">{dayName}</p>
                                <p className="text-sm text-slate-300">{dayStamp}</p>
                              </div>
                              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white">
                                {Math.round(day.temp.day)}°F
                              </span>
                            </div>

                            <div className="mt-4 flex items-center gap-3">
                              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5">
                                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent opacity-70" />
                                <Image
                                  src={getWeatherIcon(day.weather[0].main, dayHourTime)}
                                  alt="Weather Icon"
                                  width={42}
                                  height={42}
                                  className="relative z-10"
                                />
                              </div>
                              <div className="flex flex-col">
                                <p className="text-base capitalize text-slate-200">{day.weather[0].description}</p>
                              </div>
                            </div>

                            <div className="mt-5">
                              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-400">
                                <span>Comfort</span>
                                <span>{Math.round(tempScore)}%</span>
                              </div>
                              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-400 to-fuchsia-400"
                                  style={{ width: `${tempScore}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-slate-300">Loading forecast…</p>
                    )}
                  </div>
                </div>
              </section>

              <aside className="space-y-6">
                <div className="glass-card h-full px-6 py-6 shadow-2xl">
                  <h3 className="text-lg font-semibold text-white">AI Forecast Insight</h3>
                  <p className="mt-4 text-base leading-relaxed text-slate-200">
                    {isAdviceLoading
                      ? "AI is crafting a quick tip for you..."
                      : aiAdvice ||
                        "No AI advice available right now. Try refreshing your forecast."}
                  </p>
                </div>
              </aside>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default WeatherApp;
