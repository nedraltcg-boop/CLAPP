// index.js - Fixed for current axios-cookiejar-support (2026)

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const qs = require('qs');
const { format, addMonths, subMonths } = require('date-fns');

// Apply cookie jar support to axios (new correct way)
wrapper(axios);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: '*' })); // Change to your Thunkable/CrewLink domain later
app.use(express.json());

app.post('/api/flica-login', async (req, res) => {
  const { userID, password, airlineCode } = req.body;

  if (!userID || !password || !airlineCode) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: userID, password, or airlineCode',
    });
  }

  // Fresh cookie jar for each login (secure isolation)
  const jar = new tough.CookieJar();

  const client = axios.create({
    baseURL: `https://${airlineCode.toUpperCase()}.flica.net`,
    jar,
    withCredentials: true,
    timeout: 20000,
  });

  try {
    // Login
    await client.post(
      '/wap/Login',
      qs.stringify({ userID, password }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    // Basic success check - adjust if needed after testing
    // (FLICA often returns 200 even on fail, so we rely on subsequent calls succeeding)

    const now = new Date();
    const months = [
      format(subMonths(now, 1), 'yyyy-MM'),
      format(now, 'yyyy-MM'),
      format(addMonths(now, 1), 'yyyy-MM'),
    ];

    const flights = [];

    for (const month of months) {
      const scheduleResp = await client.get(`/wap/LoadMonthlySchedule?month=${month}`);
      const data = scheduleResp.data;

      // TEMPORARY: Log the structure so we can fix parsing next
      console.log(`Schedule data for ${month}:`, JSON.stringify(data, null, 2));

      // Placeholder parsing - will fix once we see real data
      if (data && Array.isArray(data)) {
        data.forEach((item) => {
          flights.push({
            date: item.date || '',
            flightNumber: item.flightNumber || item.flightNum || '',
            departure: item.departure || item.dep || '',
            arrival: item.arrival || item.arr || '',
            time: item.time || '',
            notes: item.notes || item.description || '',
          });
        });
      }
    }

    res.json({ success: true, flights, error: null });
  } catch (error) {
    console.error('FLICA error:', error.message);

    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    res.status(500).json({
      success: false,
      error: 'Could not fetch schedule. Airline may restrict automated access.',
    });
  }
});

app.get('/', (req, res) => res.send('FLICA backend running'));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
