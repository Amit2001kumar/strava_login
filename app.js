const express = require('express');
const axios = require('axios');
const mysql = require('mysql');
const config = require('./config');

const app = express();

// MySQL connection pool
const pool = mysql.createPool(config.database);

// Strava API endpoints
const stravaApiBaseUrl = 'https://www.strava.com/api/v3';
const authBaseUrl = 'https://www.strava.com/oauth';

// Helper function to execute SQL queries
function executeQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        reject(err);
        return;
      }

      connection.query(query, params, (error, results) => {
        connection.release();

        if (error) {
          reject(error);
        } else {
          resolve(results);
        }
      });
    });
  });
}

// Authenticate with Strava
async function authenticateWithStrava() {
  try {
    const response = await axios.post(`${authBaseUrl}/token`, {
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: config.strava.accessToken,
    });

    const { access_token, refresh_token, expires_at } = response.data;

    // Update the access token in the database
    await executeQuery(
      'UPDATE strava_auth SET access_token = ?, refresh_token = ?, expires_at = ? WHERE id = 1',
      [access_token, refresh_token, expires_at]
    );

    return access_token;
  } catch (error) {
    console.error('Error authenticating with Strava:', error);
    throw error;
  }
}

// Middleware to check if the access token is valid and refresh if necessary
async function ensureAccessToken(req, res, next) {
  try {
    const results = await executeQuery('SELECT * FROM strava_auth WHERE id = 1');
    const { access_token, refresh_token, expires_at } = results[0];

    // Check if the access token is expired or will expire soon
    if (Date.now() > new Date(expires_at).getTime() - 60000) {
      // Token expired or will expire in less than 1 minute, refresh it
      req.accessToken = await authenticateWithStrava();
    } else {
      req.accessToken = access_token;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Get authenticated athlete
app.get('/athlete', ensureAccessToken, async (req, res) => {
  try {
    const response = await axios.get(`${stravaApiBaseUrl}/athlete`, {
      headers: {
        Authorization: `Bearer ${req.accessToken}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error retrieving athlete:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create an activity
app.post('/activities', ensureAccessToken, async (req, res) => {
  try {
    // Retrieve activity data from the request body
    const { user_id, access_token, refresh_token, expires_at } = req.body;

    const response = await axios.post(
      `${stravaApiBaseUrl}/activities`,
      {
        user_id,
        access_token,
        refresh_token,
        expires_at,
      },
      {
        headers: {
          Authorization: `Bearer ${req.accessToken}`,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get activity
app.get('/activities/:id', ensureAccessToken, async (req, res) => {
  try {
    const response = await axios.get(`${stravaApiBaseUrl}/activities/${req.params.id}`, {
      headers: {
        Authorization: `Bearer ${req.accessToken}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error retrieving activity:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// List activity comments
app.get('/activities/:id/comments', ensureAccessToken, async (req, res) => {
  try {
    const response = await axios.get(`${stravaApiBaseUrl}/activities/${req.params.id}/comments`, {
      headers: {
        Authorization: `Bearer ${req.accessToken}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error listing activity comments:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// List athlete activities
app.get('/athlete/activities', ensureAccessToken, async (req, res) => {
  try {
    const response = await axios.get(`${stravaApiBaseUrl}/athlete/activities`, {
      headers: {
        Authorization: `Bearer ${req.accessToken}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error listing athlete activities:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update activity
app.put('/activities/:id', ensureAccessToken, async (req, res) => {
  try {
    // Retrieve updated activity data from the request body
    const { name, type } = req.body;

    const response = await axios.put(
      `${stravaApiBaseUrl}/activities/${req.params.id}`,
      {
        name,
        type,
      },
      {
        headers: {
          Authorization: `Bearer ${req.accessToken}`,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error updating activity:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
