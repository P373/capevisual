document.addEventListener('DOMContentLoaded', () => {
    const dashboardContainer = document.getElementById('dashboard-container');
    const loadingMessage = document.getElementById('loading-message');
    const errorMessage = document.getElementById('error-message');
    const marineForecastBox = document.getElementById('marine-forecast-box');
    const detailedMarineForecastText = document.getElementById('detailed-marine-forecast-text');
    document.getElementById('current-year').textContent = new Date().getFullYear();

    // --- Configuration ---
    const MEGASETT_HARBOR_TIDE_STATION_ID = '8447685';
    const MEGASETT_HARBOR_LAT = 41.6509;
    const MEGASETT_HARBOR_LON = -70.6349;
    const BUZZARDS_BAY_MARINE_ZONE = 'ANZ234';
    const NUM_DAYS_DISPLAY = 7;
    const NUM_DAYS_FORECAST = 3;

    // NOAA API requires a User-Agent. IMPORTANT: Replace with your actual contact info.
    const USER_AGENT = '(MegansettDashboard, your_email@example.com)'; // <-- REPLACE THIS!

    // Helper to format dates for display
    function formatDate(date) {
        return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }

    // Helper to format time (e.g., "6:32 AM")
    function formatTime(dateObj) {
        if (!dateObj || isNaN(dateObj.getTime())) {
            return 'N/A';
        }
        return dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    // Helper to format height (e.g., "4 ft 3 in")
    function formatHeight(feet) {
        if (isNaN(feet)) return 'N/A';
        const totalInches = Math.round(feet * 12);
        const ft = Math.floor(totalInches / 12);
        const inches = totalInches % 12;
        return `${ft} ft ${inches} in`;
    }

    // Function to display errors prominently
    function displayError(message) {
        console.error("Dashboard Error:", message);
        loadingMessage.style.display = 'none';
        errorMessage.textContent = `Error: ${message}`;
        errorMessage.classList.remove('error-hidden');
        dashboardContainer.innerHTML = '';
        marineForecastBox.classList.add('hidden');
    }

    // Helper to get moon phase emoji and label using SunCalc's phase fraction
    function getMoonPhaseInfo(fraction) {
        let phase = "Unknown Phase";
        let emoji = "❓";

        if (fraction >= 0 && fraction < 0.05 || fraction > 0.95) {
            phase = "New Moon";
            emoji = "🌑";
        } else if (fraction >= 0.05 && fraction < 0.22) {
            phase = "Waxing Crescent";
            emoji = "🌒";
        } else if (fraction >= 0.22 && fraction < 0.28) {
            phase = "First Quarter";
            emoji = "🌓";
        } else if (fraction >= 0.28 && fraction < 0.45) {
            phase = "Waxing Gibbous";
            emoji = "🌔";
        } else if (fraction >= 0.45 && fraction < 0.55) {
            phase = "Full Moon";
            emoji = "🌕";
        } else if (fraction >= 0.55 && fraction < 0.72) {
            phase = "Waning Gibbous";
            emoji = "🌖";
        } else if (fraction >= 0.72 && fraction < 0.78) {
            phase = "Last Quarter";
            emoji = "🌗";
        } else if (fraction >= 0.78 && fraction <= 0.95) {
            phase = "Waning Crescent";
            emoji = "🌘";
        }
        return { phase, emoji };
    }

    // --- API Fetching Functions ---

    async function fetchTidePredictions() {
        console.log("Fetching tide predictions...");
        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + NUM_DAYS_DISPLAY);

        const startDateFormatted = today.toISOString().slice(0, 10).replace(/-/g, '');
        const endDateFormatted = endDate.toISOString().slice(0, 10).replace(/-/g, '');

        const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=MegansettDashboard&begin_date=${startDateFormatted}&end_date=${endDateFormatted}&datum=MLLW&station=${MEGASETT_HARBOR_TIDE_STATION_ID}&time_zone=lst_ldt&units=english&interval=hilo&format=json`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`NOAA Tides API error: ${response.status} ${response.statusText} - ${errorText}`);
            }
            const data = await response.json();
            console.log("Tide data received:", data);
            if (data.predictions) {
                return data.predictions;
            } else {
                console.warn("NOAA Tides: 'predictions' array not found or empty.", data);
                return [];
            }
        } catch (error) {
            console.error("Failed to fetch tide data:", error);
            throw new Error(`Failed to load tide data: ${error.message}`);
        }
    }

    // Fetch the full text marine forecast from weather.gov (direct scrape attempt)
    // *** IMPORTANT: This direct scrape is prone to CORS errors in browsers. ***
    // *** If it fails, a server-side proxy is the robust solution. ***
    async function fetchMarineTextForecast() {
        console.log("Attempting to fetch marine text forecast directly from weather.gov...");
        const url = `https://forecast.weather.gov/shmrn.php?mz=${BUZZARDS_BAY_MARINE_ZONE}`;

        try {
            const response = await fetch(url, {
                headers: {
                    // Using a common browser User-Agent to make the request appear legitimate
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36'
                }
            });
            if (!response.ok) {
                // Check for a specific CORS error message if available
                if (response.type === 'opaque' || response.status === 0) { // Opaque response or status 0 often indicates CORS blocking
                    throw new Error(`CORS or network error preventing direct access to marine forecast.`);
                }
                throw new Error(`Failed to fetch marine text forecast: ${response.status} ${response.statusText}`);
            }
            const htmlText = await response.text();
            console.log("Marine text forecast HTML received (first 500 chars):", htmlText.substring(0, 500)); // Log full text or significant portion for debugging

            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');

            let fullText = '';
            // First, try to get the text from a well-known container or the body itself
            const forecastElement = doc.querySelector('#forecast-text pre') ||
                                    doc.querySelector('.product-text') ||
                                    doc.querySelector('body > pre');

            if (forecastElement && forecastElement.textContent) {
                fullText = forecastElement.textContent;
            } else if (doc.body && doc.body.textContent) {
                // As a last resort, try the entire body text content
                fullText = doc.body.textContent;
            }

            if (fullText) {
                const startIndex = fullText.indexOf(BUZZARDS_BAY_MARINE_ZONE);
                if (startIndex !== -1) {
                    // Find the end of the current forecast product (often indicated by a specific pattern or start of next product)
                    const endOfForecast = fullText.indexOf('$$', startIndex); // Common NWS product end marker
                    let relevantText = fullText.substring(startIndex, endOfForecast !== -1 ? endOfForecast : undefined);

                    // Clean up extra newlines/spaces that might accumulate from textContent
                    relevantText = relevantText.replace(/\n\s*\n/g, '\n').trim(); // Collapse multiple newlines to single
                    return relevantText;
                } else {
                    console.warn("Could not find marine zone code in forecast text, returning full content with disclaimer.");
                    return "Warning: Zone not found. Full text (may be irrelevant): \n" + fullText.trim();
                }
            } else {
                console.warn("No usable text content found in document body or common forecast elements.");
                return 'Detailed marine forecast text could not be extracted.';
            }

        } catch (error) {
            console.error("Failed to fetch or parse marine text forecast:", error);
            return `Failed to load detailed marine forecast: ${error.message}. (This may be due to browser security restrictions or website changes.)`;
        }
    }

    // Sun & Moon data using SunCalc.js
    function getSunMoonDataForDay(date) {
        console.log("Calculating Sun/Moon for date:", date);
        try {
            if (!(date instanceof Date) || isNaN(date.getTime())) {
                console.error("getSunMoonDataForDay received invalid date:", date);
                return { sunrise: null, sunset: null, moonrise: null, moonset: null, moonPhase: 'N/A', moonPhaseEmoji: '❓' };
            }

            if (typeof SunCalc === 'undefined') {
                console.error("SunCalc library is not loaded. Cannot calculate sun/moon times. Check suncalc.min.js path in index.html.");
                return { sunrise: null, sunset: null, moonrise: null, moonset: null, moonPhase: 'Error', moonPhaseEmoji: '❗' };
            }

            const times = SunCalc.getTimes(date, MEGASETT_HARBOR_LAT, MEGASETT_HARBOR_LON);
            const moon = SunCalc.getMoonTimes(date, MEGASETT_HARBOR_LAT, MEGASETT_HARBOR_LON);
            const moonIllumination = SunCalc.getMoonIllumination(date);

            const moonPhaseInfo = getMoonPhaseInfo(moonIllumination.phase);

            console.log(`SunCalc raw results for ${date.toDateString()}:`, { times, moon, moonIllumination });

            const sunriseTime = times.sunrise instanceof Date && !isNaN(times.sunrise.getTime()) ? times.sunrise : null;
            const sunsetTime = times.sunset instanceof Date && !isNaN(times.sunset.getTime()) ? times.sunset : null;
            const moonriseTime = moon.rise instanceof Date && !isNaN(moon.rise.getTime()) ? moon.rise : null;
            const moonsetTime = moon.set instanceof Date && !isNaN(moon.set.getTime()) ? moon.set : null;

            return {
                sunrise: sunriseTime,
                sunset: sunsetTime,
                moonrise: moonriseTime,
                moonset: moonsetTime,
                moonPhase: moonPhaseInfo.phase,
                moonPhaseEmoji: moonPhaseInfo.emoji
            };
        } catch (e) {
            console.error("Error calculating sun/moon data for date:", date, e);
            return {
                sunrise: null, sunset: null, moonrise: null, moonset: null,
                moonPhase: 'Error', moonPhaseEmoji: '❗'
            };
        }
    }

    // --- Main Dashboard Initialization ---
    async function initializeDashboard() {
        loadingMessage.style.display = 'block';
        errorMessage.classList.add('error-hidden');
        dashboardContainer.innerHTML = '';
        marineForecastBox.classList.add('hidden');

        let tideData = [];
        let marineTextForecast = '';
        let weatherForecastPeriods = [];

        try {
            if (typeof SunCalc === 'undefined') {
                displayError("Sun & Moon data cannot load: SunCalc library is missing. Please ensure 'suncalc.min.js' is correctly linked in index.html.");
                return;
            }

            const [tidesResult, marineTextResult, weatherApiResult] = await Promise.allSettled([
                fetchTidePredictions(),
                fetchMarineTextForecast(),
                fetch('https://api.weather.gov/points/' + MEGASETT_HARBOR_LAT + ',' + MEGASETT_HARBOR_LON, { headers: { 'User-Agent': USER_AGENT } })
                    .then(res => {
                        if (!res.ok) throw new Error(`NWS Points API error: ${res.status} ${res.statusText}`);
                        return res.json();
                    })
                    .then(data => fetch(data.properties.forecast, { headers: { 'User-Agent': USER_AGENT } }))
                    .then(res => {
                        if (!res.ok) throw new Error(`NWS Forecast API error: ${res.status} ${res.statusText}`);
                        return res.json();
                    })
                    .then(data => data.properties.periods.slice(0, NUM_DAYS_FORECAST * 2))
            ]);

            if (tidesResult.status === 'fulfilled') {
                tideData = tidesResult.value;
            } else {
                console.error("Tides data failed:", tidesResult.reason);
            }

            if (marineTextResult.status === 'fulfilled') {
                marineTextForecast = marineTextResult.value;
                detailedMarineForecastText.textContent = marineTextForecast;
                marineForecastBox.classList.remove('hidden');
            } else {
                console.error("Detailed marine text forecast failed:", marineTextResult.reason);
                detailedMarineForecastText.textContent = `Failed to load detailed marine forecast: ${marineTextResult.reason.message}`;
                marineForecastBox.classList.remove('hidden');
            }

            if (weatherApiResult.status === 'fulfilled') {
                weatherForecastPeriods = weatherApiResult.value;
            } else {
                console.error("General weather forecast failed:", weatherApiResult.reason);
            }

            loadingMessage.style.display = 'none';

            if (tidesResult.status === 'rejected' && marineTextResult.status === 'rejected' && weatherApiResult.status === 'rejected') {
                displayError("All primary data sources failed to load. Please check your network and console for errors.");
                return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const dailyData = {};

            for (let i = 0; i < NUM_DAYS_DISPLAY; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() + i);
                const dateStr = date.toISOString().slice(0, 10);
                dailyData[dateStr] = {
                    dateObj: date,
                    tides: [],
                    generalWeather: { day: '', night: '' },
                    astronomy: null
                };
            }

            tideData.forEach(tide => {
                const dateStr = tide.t.split(' ')[0];
                if (dailyData[dateStr]) {
                    dailyData[dateStr].tides.push(tide);
                }
            });

            weatherForecastPeriods.forEach((period) => {
                const date = new Date(period.startTime);
                date.setHours(0, 0, 0, 0);
                const dateStr = date.toISOString().slice(0, 10);

                if (dailyData[dateStr]) {
                    if (period.isDaytime) {
                        dailyData[dateStr].generalWeather.day = period.detailedForecast;
                    } else {
                        dailyData[dateStr].generalWeather.night = period.detailedForecast;
                    }
                }
            });

            const sortedDates = Object.keys(dailyData).sort();

            sortedDates.forEach((dateStr, i) => {
                const cardData = dailyData[dateStr];

                cardData.astronomy = getSunMoonDataForDay(cardData.dateObj);

                let generalWeatherContent = 'No general weather forecast available for this day.';
                if (cardData.generalWeather.day || cardData.generalWeather.night) {
                    generalWeatherContent = '';
                    if (cardData.generalWeather.day) {
                        generalWeatherContent += `**Day:** ${cardData.generalWeather.day.trim()}\n`;
                    }
                    if (cardData.generalWeather.night) {
                        generalWeatherContent += `**Night:** ${cardData.generalWeather.night.trim()}\n`;
                    }
                }

                const card = document.createElement('div');
                card.classList.add('day-card');

                card.innerHTML = `
                    <div class="card-header">
                        <h2>${formatDate(cardData.dateObj)}</h2>
                    </div>
                    <div class="card-section">
                        <h3>Tides</h3>
                        <ul>
                            ${cardData.tides.length > 0 ?
                                cardData.tides.map(tide =>
                                    `<li class="tide-info">${tide.type === 'H' ? 'High Tide' : 'Low Tide'} – ${formatTime(new Date(tide.t))} – ${formatHeight(parseFloat(tide.v))}</li>`
                                ).join('') : '<li>No tide data available.</li>'}
                        </ul>
                    </div>
                    <div class="card-section">
                        <h3>Sun & Moon</h3>
                        <ul>
                            <li>Sunrise: ${formatTime(cardData.astronomy.sunrise)}</li>
                            <li>Sunset: ${formatTime(cardData.astronomy.sunset)}</li>
                            <li>Moonrise: ${formatTime(cardData.astronomy.moonrise)}</li>
                            <li>Moonset: ${formatTime(cardData.astronomy.moonset)}</li>
                            <li class="moon-phase">
                                <span class="emoji">${cardData.astronomy.moonPhaseEmoji}</span>
                                ${cardData.astronomy.moonPhase}
                            </li>
                        </ul>
                    </div>
                    <div class="card-section">
                        <h3>General Weather</h3>
                        <p class="marine-forecast-text">${generalWeatherContent}</p>
                    </div>
                `;
                dashboardContainer.appendChild(card);
            });

        } catch (error) {
            console.error("Critical error in initializeDashboard:", error);
            displayError(`An unrecoverable error occurred: ${error.message}`);
        }
    }

    initializeDashboard();
});