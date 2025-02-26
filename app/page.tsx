"use client";

import React, { useState, useEffect } from 'react';
import { fetchAiWeatherAdvice } from '@/utils/ai';
import Image from 'next/image';

// Defin typs for weather data
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

const WeatherApp: React.FC = () => {
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [currentHour, setCurrentHour] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined'){
      setCurrentHour(new Date().getHours());
    }
  }, []); 

  const isNight = currentHour !== null ?  currentHour >= 18 || currentHour < 6 : false;
  
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const [aiAdvice, setAiAdvice] = useState<string>("Loading AI Advice...");
  useEffect(() => {
    if (weatherData) {
      console.log("Weather Description for AI:", weatherData.current.weather[0].description);
      console.log("Temperature for AI:", weatherData.current.temp);

      fetchAiWeatherAdvice(weatherData.current.weather[0].description, weatherData.current.temp)
        .then((advice) => setAiAdvice(advice))
        .catch(() => setAiAdvice("No AI advice available."));
    }
  }, [weatherData]);

  const fetchWeather = async (city: string, stateCode: string) => {
    try {
      const apiKey = process.env.NEXT_PUBLIC_WEATHER_API_KEY;
      if (!city) return;
  
      // Step 1: Get Latitude & Longitude using Geocoding API

      // ✅ Define the API URL for easier logging
      const apiUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${city},${stateCode},US&limit=1&appid=${apiKey}`;

      // ✅ Add logs to debug the request
      console.log("API Request URL:", apiUrl); // Log the full API request
      console.log("Using API Key:", apiKey); // Log the API key being used (just to confirm it's set)

      // ✅ Make the API request
      const geoResponse = await fetch(apiUrl);
      console.log("GeoResponse Raw Response:", geoResponse); // Log the raw response

      const geoData = await geoResponse.json();
      console.log("Full GeoData Response:", geoData); // Log the full parsed response
      console.log("First Item in GeoData:", geoData[0]); // Check the first item

  
      // debug logs to check the API response
      console.log("Full GeoData Response:", geoData);
      console.log("First Item in GeoData", geoData[0]);
  
      if (!geoData || geoData.length === 0) {
        console.error("Invalid city name:", city);
        setWeatherData(null);
        return;
      }
  
      const { lat, lon } = geoData[0];
  
      // Step 2: Fetch Current Weather (for now temperature & conditions)
      const currentResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`
      );
      const currentData = await currentResponse.json();
  
      if (!currentData || currentData.cod !== 200) {
        console.error("Invalid current weather data:", currentData);
        setWeatherData(null);
        return;
      }
  
      console.log("Current Weather API Response:", currentData);

      // Step 3: Fetch Hourly Forecast (5-day / 3-hour forecast)
      const forecastResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`
      );
      const forecastData = await forecastResponse.json();
  
      if (!forecastData || forecastData.cod !== "200") {
        console.error("Invalid forecast data:", forecastData);
        setWeatherData(null);
        return;
      }

      // Extract daily data from 5-day forecast API
      const dailyDataMap: { [date: string]: {dt: number; temp: { day: number}; weather:  {main: string; description: string }[] } } = {};

      forecastData.list.forEach((entry: any) => {
        const date = new Date(entry.dt * 1000).toISOString().split("T")[0]; // Get YYYY-MM-DD format

        if (!dailyDataMap[date]) {
          dailyDataMap[date] = {
            dt: entry.dt,
            temp: { day: entry.main.temp }, // Use the first temp of the day
            weather: entry.weather,
          };
        }
      });

      // Convert to array and get the next 3 days
      const dailyArray = Object.values(dailyDataMap).slice(1, 4);
  
      setWeatherData((prev) => ({
        ...prev,
        current: {
          temp: currentData.main.temp,
          feels_like: currentData.main.feels_like,
          humidity: currentData.main.humidity,
          wind_speed: currentData.wind.speed,
          weather: currentData.weather,
        },
        hourly: forecastData.list.slice(0, 6),
        daily: dailyArray,
        timezone: forecastData.city.timezone ?? 0, // ✅ Default to 0 if undefined
      }));

      if (isClient && currentData) {
        console.log("Fetching AI Advice...")
        const advice = await fetchAiWeatherAdvice(
          currentData.weather[0].description,
          currentData.main.temp
        );
        console.log("AI Advice received:", advice);

        if (advice) {
          setAiAdvice(advice);
        } else {
          setAiAdvice("No AI advice available.");
        }
      }
      
    } catch (error) {
      console.error("Error fetching weather data:", error);
      setWeatherData(null);
    }
  };

  const getBackgroundClass = (condition: string, isNight: boolean) => {
    if (isNight) {
      switch (condition) {
        case "Clear":
          return "bg-night-sky";
        case "Rain":
          return "bg-night-rain";
        case "Thunderstorm":
          return "bg-night-thunder";
        default:
          return "bg-night-sky";
      }
    } else {
      switch (condition) {
        case "Clear":
          return "bg-sunny";
        case "Clouds":
          return "bg-cloudy";
        case "Rain":
          return "bg-rainy";
        case "Thunderstorm":
          return "bg-thunder";
        default:
          return "bg-default";
      }
    }
  };
  
  const getWeatherIcon = (condition: string, hour: number) => {
    const isNight = hour >= 19 || hour < 7; // 7 PM - 7 AM is considered night time
  
    const iconMap: { [key: string]: string } = {
      Clear: isNight ? "/images/moon.svg" : "/images/clear.svg",
      Clouds: isNight ? "/images/moon_clouds.svg" : "/images/clouds.svg",
      Mist: isNight ? "/images/moon_mist.svg" : "/images/mist.svg",
      Rain: isNight ? "/images/moon_rain.svg" : "/images/rain.svg",
      Snow: isNight ? "/images/moon_snow.svg" : "/images/snow.svg",
      Thunderstorm: isNight ? "/images/moon_thunder.svg" : "/images/thunder.svg",
      "Heavy Rain": isNight ? "/images/moon_rain.svg" : "/images/moderate_heavy_rain.svg",
      "Thunder Rain": isNight ? "/images/moon_thunder.svg" : "/images/thunder_rain.svg",
    };
  
    return iconMap[condition] || "/images/no-result.svg"; // Default icon if no match
  };

  const [currentHourTime, setCurrentHourTime] = useState<number>(0);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentHourTime(new Date().getHours());
    }
  }, []);

  const handleSearch = () => {
    if (city.trim() !== "") {
      fetchWeather(city, state);
    }
  };
  
  return (
    <div className='relative min-h-screen'>
      {/* Background Image */}
      <div
        className={`absolute inset-0 ${weatherData ? getBackgroundClass(weatherData.current.weather?.[0]?.main ?? "", isNight) : "b-default"}`}
        style={{ backgroundSize: "cover", backgroundPosition: "center" }}
      ></div>

      {/* Blur Overlay */}
      <div className="absolute inset-0 bg-black bg-opacity-30 backdrop-blur-md"></div>

      {/* Main Content */}
      <div className="relative z-10 text-white">
        {/* Navbar */}
      <nav className="p-4 flex justify-between items-center bg-opacity-90 backdrop-blur-md">
        <div className='flex items-center gap-1'>
          <h1 className="text-2xl font-bold">Weather.io</h1>
          {/* Sun Icon */}
          <Image
            src='/images/clear.svg'
            alt='Sun Icon'
            width={32}
            height={32}
          />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter city..."
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="p-2 rounded bg-gray-200 text-black"
          />
          <input
            type="text"
            placeholder="State (e.g., MS, AL, GA...)"
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase())}
            className="p-2 rounded bg-gray-200 text-black"
          />
        
          <button
            onClick={handleSearch}
            className="p-2 rounded bg-blue-700 hover:bg-blue-800"
          >
            Search
          </button>
        </div>
      </nav>

      {/* Current Weather Section */}
      <main className='p-4'>
        {weatherData && (
          <div className='space-y-6'>

            {/* AI-Generated Advice */}
            {aiAdvice && (
              <div className="text-center text-lg font-semibold bg-gray-800 p-2 rounded-md">
                <p>{aiAdvice.replace(/'/g, "&apos;")}</p>
              </div>
            )}

            {/* Current Weather */}
            <section className="text-center">
              <h2 className="text-3xl font-bold">{city}</h2>
              <p className="text-lg">{weatherData.current.weather[0].description}</p>
           
              {/* Weather Icon*/}
              <div className='flex justify-center items-center mt-4'>
                <Image
                  src={weatherData ? getWeatherIcon(
                    weatherData.current.weather[0].main, currentHourTime) : "/images/no-result.svg"
                  }
                  alt='Weather Icon'
                  width={96}
                  height={96}
                />
              </div>
              {/* Display Main Temperature */}
              <p className="text-2xl" suppressHydrationWarning={true}>
                {Math.round(weatherData.current.temp)}°F
              </p>

              {/* Additional Weather Details */}
              <div className="mt-2 text-lg">
                <p suppressHydrationWarning={true}>Feels Like: {weatherData?.current?.feels_like !== undefined ? `${weatherData.current.feels_like}°F` : "N/A"}</p>
                <p suppressHydrationWarning={true}>Humidity: {weatherData?.current?.humidity !== undefined ? `${weatherData.current.humidity}%` : "N/A"}</p>
                <p suppressHydrationWarning={true}>Wind Speed: {weatherData?.current?.wind_speed !== undefined ? `${weatherData.current.wind_speed} mph` : "N/A"}</p>
              </div>
            </section>

            {/* Today's Weather */}
            <section>
              <h3 className="text-xl font-semibold">Today's Weather</h3>
              <div className="grid grid-cols-3 gap-4">
                {weatherData.hourly.slice(0, 6).map((hour, index) => {
                  const hourTime = new Date(hour.dt * 1000).getHours();

                  return (
                    <div
                      key={index}
                      className="p-4 bg-blue-600 rounded shadow text-center flex flex-col items-center"
                    >
                      {/* Display Hour */}
                      <p className="text-lg font-medium" suppressHydrationWarning={true}>
                        {new Date(hour.dt * 1000).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </p>

                      {/* Display Weather Icon with Night/Day Check */}
                      <Image
                        src={getWeatherIcon(hour.weather[0].main, hourTime)}
                        alt="Weather Icon"
                        width={40}
                        height={40}
                      />

                      {/* Display Temperature */}
                      <p className="text-xl font-bold">{Math.round(hour.main.temp)}°F</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Next Few Days */}
            <section>
              <h3 className="text-xl font-semibold">Next Few Days</h3>
              <div className="grid grid-cols-3 gap-4">
              {weatherData?.daily?.length > 0 ? (
                weatherData.daily.map((day, index) => {
                  // Ensure temp exists before accessing temp.day
                  if (!day.temp || !day.weather || day.weather.length === 0) {
                    return null; // Skip rendering if data is missing
                  }
                  const localDate = new Date((day.dt + weatherData.timezone) * 1000);
                  const dayHourTime = localDate.getHours();
                  const dayName = localDate.toLocaleDateString("en-US", { weekday: "long" });
                
                  


                  return (
                    <div key={index} className="p-4 bg-blue-700 rounded shadow text-center">
                      <p className="text-lg font-bold">{dayName}</p>

                      {/* Weather Icon */}
                      <Image
                        src={getWeatherIcon(day.weather[0].main, dayHourTime)}
                        alt="Weather Icon"
                        width={40}
                        height={40}
                      />

                      {/* Temperature */}
                      <p className="text-xl font-bold">{Math.round(day.temp.day)}°F</p>

                      {/* Description */}
                      <p className="text-sm">{day.weather[0].description}</p>
                    </div>
                  );
                })
              ) : (
                <p className="text-center">Loading forecast...</p>
              )}
              </div>
            </section>
          </div>
        )}

      </main>
      </div>
    </div>
  )

}


export default WeatherApp;