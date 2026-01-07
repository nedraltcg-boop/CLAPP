// index.js - Updated for 2026 compatibility

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const qs = require('qs');
const { format, addMonths, subMonths } = require('date-fns');

// Enable cookie jar support globally for axios
wrapper(axios);

const app = express();
const port = process.env.PORT || 3000;

// Allow CORS (restrict origin in production for security)
app.use(cors({ origin: '*' }));
app.use(express.json());

app.post('/api/flica-login', async (req, res) => {
  const { userID, password, airlineCode } = req.body;

  if (!userID || !password || !airlineCode) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: userID, password, or airlineCode',
    });
  }

  // Create a fresh cookie jar for this request
  const jar = new tough.CookieJar();

  // Create axios instance with base URL and cookie support
  const client = axios.create({
    baseURL: `https://${airlineCode.toUpperCase()}.flica.net`,
    jar,
    withCredentials: true,
    timeout: 15000, // 15 second timeout
  });

  try {
    // Step 1: Login
    const loginResponse = await client.post(
      '/wap/Login',
      qs.stringify({ userID, password }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    // FLICA usually returns 200 even on failure — we need to check response content
    // Adjust this check based on actual behavior (you can test with browser dev tools)
    const loginData = loginResponse.data;
    if (typeof loginData === 'string' && loginData.includes('Invalid')) {
      return res.status(401).json({ success: false, error: 'Login failed: Invalid credentials' });
    }

    // Step 2: Fetch schedules for previous, current, and next month
    const now = new Date();
    const months = [
      format(subMonths(now, 1), 'yyyy-MM'),
      format(now, 'yyyy-MM'),
      format(addMonths(now, 1), 'yyyy-MM'),
    ];

    const flights = [];

    for (const month of months) {
      const scheduleResponse = await client.get(`/wap/LoadMonthlySchedule?month=${month}`);

      // IMPORTANT: The actual response format varies by airline.
      // For Mesa (ASH.flica.net), it's often JSON. Inspect the real response!
      const data = scheduleResponse.data;

      // Example parsing assuming JSON with an 'events' array
      // Adjust this section based on what you see in browser Network tab
      if (data && Array.isArray(data.events)) {
        data.events.forEach((event) => {
          flights.push({
            date: event.date || event.DTSTART || '',
            flightNumber: event.flightNumber || event.SUMMARY?.match(/\d{3,4}[A-Z]?/)?.[0] || '',
            departure: event.departure || event.LOCATION?.split('-')[0]?.trim() || '',
            arrival: event.arrival || event.LOCATION?.split('-')[1]?.trim() || '',
            time: event.time || `${event.DTSTART || ''} - ${event.DTEND || ''}`,
            duration: event.duration || '',
            notes: event.DESCRIPTION || event.SUMMARY || '',
          });
        });
      }
      // If response is HTML, you may need cheerio (add later if needed)
    }

    return res.json({
      success: true,
      flights,
      error: null,
    });
  } catch (error) {
    console.error('FLICA fetch error:', error.message);

    if (error.response) {
      if (error.response.status === 401 || error.response.status === 403) {
        return res.status(401).json({ success: false, error: 'Login failed: Invalid credentials or session' });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to reach FLICA or parse schedule. Airline may block automated access.',
    });
  }
});

// Health check endpoint (optional)
app.get('/', (req, res) => {
  res.send('FLICA backend is running');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
