document.addEventListener('DOMContentLoaded', () => {
    const dashboardContainer = document.getElementById('dashboard-container');
    const loadingMessage = document.getElementById('loading-message');
    const errorMessage = document.getElementById('error-message');
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
            // console.warn("Invalid Date object passed to formatTime:", dateObj); // For debugging invalid date objects
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
        dashboardContainer.innerHTML = ''; // Clear any incomplete rendering
    }

    // Helper to get moon phase emoji and label using SunCalc's phase fraction
    function getMoonPhaseInfo(fraction) {
        let phase = "Unknown Phase";
        let emoji = "❓";

        // SunCalc.getMoonIllumination().phase is 0-1, where 0 is new moon, 0.25 first quarter, 0.5 full, 0.75 last quarter.
        if (fraction >= 0 && fraction < 0.05 || fraction > 0.95) { // Near New Moon
            phase = "New Moon";
            emoji = "🌑";
        } else if (fraction >= 0.05 && fraction < 0.22) {
            phase = "Waxing Crescent";
            emoji = "🌒";
        } else if (fraction >= 0.22 && fraction < 0.28) { // Near First Quarter
            phase = "First Quarter";
            emoji = "🌓";
        } else if (fraction >= 0.28 && fraction < 0.45) {
            phase = "Waxing Gibbous";
            emoji = "🌔";
        } else if (fraction >= 0.45 && fraction < 0.55) { // Near Full Moon
            phase = "Full Moon";
            emoji = "🌕";
        } else if (fraction >= 0.55 && fraction < 0.72) {
            phase = "Waning Gibbous";
            emoji = "🌖";
        } else if (fraction >= 0.72 && fraction < 0.78) { // Near Last Quarter
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

    // Fetch the full text marine forecast from weather.gov (scraping method)
    async function fetchMarineTextForecast() {
        console.log("Fetching marine text forecast from weather.gov...");
        const url = `https://forecast.weather.gov/shmrn.php?mz=${BUZZARDS_BAY_MARINE_ZONE}`;
        try {
            // NWS website often blocks requests without a browser-like User-Agent
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36' // Faking a browser UA
                }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch marine text forecast: ${response.status} ${response.statusText}`);
            }
            const htmlText = await response.text();
            console.log("Marine text forecast HTML received (first 500 chars):", htmlText.substring(0, 500));

            // Parse the HTML to extract the forecast text
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');

            // NWS marine forecast text is often within <pre> tags or specific divs
            // Look for the element that contains the full text forecast for the zone
            let forecastElement = doc.querySelector('#forecast-text pre') || // Common for some NWS pages
                                  doc.querySelector('.product-text') || // Another common class
                                  doc.querySelector('body > pre') || // Sometimes directly in a pre tag in body
                                  doc.querySelector('body'); // Fallback to body content

            if (forecastElement) {
                // The text content might contain multiple forecasts. We need to find the relevant section.
                // The marine forecast usually starts with the zone code (e.g., ANZ234).
                const fullText = forecastElement.textContent || '';
                const startIndex = fullText.indexOf(BUZZARDS_BAY_MARINE_ZONE);
                if (startIndex !== -1) {
                    const relevantText = fullText.substring(startIndex);
                    // You might need more sophisticated parsing to break this into daily chunks
                    // For now, we'll return the whole relevant block.
                    return relevantText.trim();
                } else {
                    console.warn("Could not find marine zone in forecast text, returning full text or specific element content.");
                    return fullText.trim() || forecastElement.textContent.trim();
                }
            }
            console.warn("Could not find forecast element in marine text page.");
            return 'Detailed marine forecast could not be parsed from source.';

        } catch (error) {
            console.error("Failed to fetch or parse marine text forecast:", error);
            // Don't re-throw, just return a message so the page can still load other data
            return `Failed to load detailed marine forecast: ${error.message}. (Note: This is a direct scrape and can be unreliable.)`;
        }
    }


    // Sun & Moon data using SunCalc.js
    function getSunMoonDataForDay(date) {
        try {
            if (!(date instanceof Date) || isNaN(date.getTime())) {
                console.error("getSunMoonDataForDay received invalid date:", date);
                throw new Error("Invalid date for SunCalc calculation.");
            }

            const times = SunCalc.getTimes(date, MEGASETT_HARBOR_LAT, MEGASETT_HARBOR_LON);
            const moon = SunCalc.getMoonTimes(date, MEGASETT_HARBOR_LAT, MEGASETT_HARBOR_LON);
            const moonIllumination = SunCalc.getMoonIllumination(date);

            const moonPhaseInfo = getMoonPhaseInfo(moonIllumination.phase);

            // SunCalc.getMoonTimes returns {rise: Date|null, set: Date|null, alwaysUp: boolean, alwaysDown: boolean}
            // Ensure times are Date objects before passing to formatTime
            const sunriseTime = times.sunrise instanceof Date && !isNaN(times.sunrise.getTime()) ? times.sunrise : null;
            const sunsetTime = times.sunset instanceof Date && !isNaN(times.sunset.getTime()) ? times.sunset : null;
            const moonriseTime = moon.rise instanceof Date && !isNaN(moon.rise.getTime()) ? moon.rise : null;
            const moonsetTime = moon.set instanceof Date && !isNaN(moon.set.getTime()) ? moon.set : null;

            console.log(`Sun/Moon data for ${date.toDateString()}:`, {
                sunrise: sunriseTime, sunset: sunsetTime, moonrise: moonriseTime, moonset: moonsetTime,
                moonPhase: moonPhaseInfo.phase, moonPhaseEmoji: moonPhaseInfo.emoji
            });

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
                moonPhase: 'N/A', moonPhaseEmoji: '❓'
            };
        }
    }

    // --- Main Dashboard Initialization ---
    async function initializeDashboard() {
        loadingMessage.style.display = 'block';
        errorMessage.classList.add('error-hidden');
        dashboardContainer.innerHTML = '';

        let tideData = [];
        let marineTextForecast = ''; // Stores the single block of detailed marine text
        let weatherForecastPeriods = []; // Stores the general weather periods from NWS API

        try {
            // Fetch all data sources concurrently
            const [tidesResult, marineTextResult, weatherApiResult] = await Promise.allSettled([
                fetchTidePredictions(),
                fetchMarineTextForecast(), // New call for detailed marine text
                // This call provides general weather and wind details
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
                    .then(data => data.properties.periods.slice(0, NUM_DAYS_FORECAST * 2)) // Get general forecast periods
            ]);

            if (tidesResult.status === 'fulfilled') {
                tideData = tidesResult.value;
            } else {
                console.error("Tides data failed:", tidesResult.reason);
                // Optionally display a less intrusive error for a single failed data source
            }

            if (marineTextResult.status === 'fulfilled') {
                marineTextForecast = marineTextResult.value;
            } else {
                console.error("Detailed marine text forecast failed:", marineTextResult.reason);
                marineTextForecast = `Failed to load detailed marine forecast: ${marineTextResult.reason.message}`;
            }

            if (weatherApiResult.status === 'fulfilled') {
                weatherForecastPeriods = weatherApiResult.value;
            } else {
                console.error("General weather forecast failed:", weatherApiResult.reason);
                // Optionally display a less intrusive error
            }

            loadingMessage.style.display = 'none'; // Hide loading message once fetching is attempted

            // Check if any critical data loaded, if not, show a main error
            if (tideData.length === 0 && marineTextForecast.startsWith('Failed to load') && weatherForecastPeriods.length === 0) {
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

            // Render cards
            const sortedDates = Object.keys(dailyData).sort();

            sortedDates.forEach((dateStr, i) => {
                const cardData = dailyData[dateStr];

                // Calculate Sun/Moon data for each card's date
                cardData.astronomy = getSunMoonDataForDay(cardData.dateObj);

                // General Weather (from NWS API)
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
                    ${i < NUM_DAYS_FORECAST ? `
                    <div class="card-section">
                        <h3>Marine Forecast (Detailed)</h3>
                        <p class="marine-forecast-text">${marineTextForecast}</p>
                        <p style="font-size:0.8em; color:#888;">(Note: Detailed forecast is a direct scrape from weather.gov, which can be unreliable if their page structure changes. Displayed for first 3 days only.)</p>
                    </div>
                    <div class="card-section">
                        <h3>General Weather</h3>
                        <p class="marine-forecast-text">${generalWeatherContent}</p>
                    </div>` : `
                    <div class="card-section">
                        <h3>General Weather</h3>
                        <p class="marine-forecast-text">${generalWeatherContent}</p>
                        <p style="font-size:0.8em; color:#888;">(Detailed Marine Forecast for more than 3 days not available via direct scrape.)</p>
                    </div>`}
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