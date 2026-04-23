const net = require('net');
const http = require('http');
const fs = require('fs');

// ─── In-memory database (stores last location of each vehicle) ───
const vehicles = {};
const locationHistory = [];

// ─── TCP Server (receives data from V8 GPS tracker) ───
const tcpServer = net.createServer((socket) => {
  console.log('Tracker connected:', socket.remoteAddress);

  socket.on('data', (data) => {
    const raw = data.toString('hex');
    console.log('Raw data received:', raw);

    try {
      // Parse basic GT06 protocol (used by most V8 trackers)
      if (raw.startsWith('7878')) {
        const packetType = raw.substring(6, 8);

        // Login packet
        if (packetType === '01') {
          const imei = raw.substring(8, 24);
          console.log('Login from IMEI:', imei);
          // Send login confirmation
          socket.write(Buffer.from('787805010001d9dc0d0a', 'hex'));
        }

        // Location packet
        if (packetType === '12') {
          const imei = socket.imei || 'unknown';
          const lat = parseFloat((parseInt(raw.substring(16, 24), 16) / 1800000).toFixed(6));
          const lng = parseFloat((parseInt(raw.substring(24, 32), 16) / 1800000).toFixed(6));
          const speed = parseInt(raw.substring(32, 34), 16);
          const timestamp = new Date().toISOString();

          const locationData = { imei, lat, lng, speed, timestamp };
          vehicles[imei] = locationData;
          locationHistory.push(locationData);

          // Keep only last 1000 records
          if (locationHistory.length > 1000) locationHistory.shift();

          console.log(`Location update — IMEI: ${imei} | Lat: ${lat} | Lng: ${lng} | Speed: ${speed} km/h`);
        }
      }
    } catch (err) {
      console.log('Parse error:', err.message);
    }
  });

  socket.on('error', (err) => console.log('Socket error:', err.message));
  socket.on('close', () => console.log('Tracker disconnected'));
});

tcpServer.listen(5000, () => {
  console.log('GPS TCP server running on port 5000');
});

// ─── HTTP Server (serves API to your dashboard) ───
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // GET /vehicles — returns all vehicles with last known location
  if (req.url === '/vehicles') {
    res.end(JSON.stringify(Object.values(vehicles)));

  // GET /history — returns full location history
  } else if (req.url === '/history') {
    res.end(JSON.stringify(locationHistory));

  // GET /history?imei=XXXX — returns history for one vehicle
  } else if (req.url.startsWith('/history?imei=')) {
    const imei = req.url.split('=')[1];
    const filtered = locationHistory.filter(l => l.imei === imei);
    res.end(JSON.stringify(filtered));

  // GET /status — server health check
  } else if (req.url === '/status') {
    res.end(JSON.stringify({
      status: 'running',
      vehicles: Object.keys(vehicles).length,
      totalRecords: locationHistory.length,
      uptime: Math.floor(process.uptime()) + ' seconds'
    }));

  } else {
    res.end(JSON.stringify({ message: 'GPS Tracker Server is running!' }));
  }
});

httpServer.listen(3000, () => {
  console.log('HTTP API server running on port 3000');
  console.log('API endpoints:');
  console.log('  GET /vehicles  — all vehicles');
  console.log('  GET /history   — location history');
  console.log('  GET /status    — server status');
});
