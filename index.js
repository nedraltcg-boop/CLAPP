// index.js

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const tough = require('tough-cookie');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const qs = require('qs'); // For form-urlencoded
const { format, addMonths, subMonths } = require('date-fns');

axiosCookieJarSupport(axios);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: '*' })); // Adjust for your CrewLink app domain in production
app.use(express.json());

app.post('/api/flica-login', async (req, res) => {
  const { userID, password, airlineCode } = req.body;

  if (!userID || !password || !airlineCode) {
    return res.status(400).json({ success: false, error: 'Missing required fields: userID, password, or airlineCode' });
  }

  const jar = new tough.CookieJar();
  const client = axios.create({
    baseURL: `https://${airlineCode.toLowerCase()}.flica.net`,
    jar,
    withCredentials: true,
  });

  try {
    // Login POST
    const loginResponse = await client.post('/wap/Login', qs.stringify({ userID, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    // Assume successful login if status 200 and no error in data; adjust based on actual response
    if (loginResponse.status !== 200) {
      return res.status(401).json({ success: false, error: 'Login failed: Invalid credentials or server error' });
    }

    // Get current, previous, and next months
    const now = new Date();
    const months = [
      format(subMonths(now, 1), 'yyyy-MM'),
      format(now, 'yyyy-MM'),
      format(addMonths(now, 1), 'yyyy-MM'),
    ];

    const flights = [];

    for (const month of months) {
      const scheduleResponse = await client.get(`/wap/LoadMonthlySchedule?month=${month}`);

      // Assume response.data is JSON with 'events' array; adjust parsing as needed
      // If HTML, you could add cheerio here: const cheerio = require('cheerio'); const $ = cheerio.load(scheduleResponse.data);
      if (scheduleResponse.data && Array.isArray(scheduleResponse.data.events)) {
        const parsedEvents = scheduleResponse.data.events.map(event => ({
          date: event.date || event.DTSTART, // Adjust based on actual keys
          flightNumber: event.flightNumber || event.SUMMARY,
          departure: event.departure || event.LOCATION?.split('-')[0],
          arrival: event.arrival || event.LOCATION?.split('-')[1],
          time: event.time || `${event.DTSTART} - ${event.DTEND}`,
          duration: event.duration, // Calculate if needed
        }));
        flights.push(...parsedEvents);
      } else {
        throw new Error('Unexpected schedule response format');
      }
    }

    // No storage of credentials; they are discarded after use

    return res.json({ success: true, flights, error: null });
  } catch (error) {
    console.error('Error:', error.message); // Log error without credentials
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ success: false, error: 'Login failed: Invalid credentials' });
    }
    return res.status(500).json({ success: false, error: `Server error: ${error.message}` });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
