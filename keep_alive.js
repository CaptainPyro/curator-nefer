const express = require('express');
const server = express();

// Optional: keep token check if you want some minimal security
const SECRET_TOKEN = "TheEgyptianCat252025";

server.all('/', (req, res) => {
  res.send('✅ Bot is alive!');
});

// Make /ping always respond with 200 OK
server.get('/ping', (req, res) => {
  const token = req.query.token;
  if (!token || token !== SECRET_TOKEN) {
    console.warn("Ping received without valid token — accepted anyway to keep alive.");
    return res.status(200).send("Pong (unauthorized, but keeping alive).");
  } else {
    console.log("Ping received from Google Apps Script ✅");
    return res.status(200).send("Pong (authorized).");
  }
});

function keepAlive() {
  server.listen(3000, () => {
    console.log('🌐 Server is ready — keep-alive is active!');
  });
}

module.exports = keepAlive;
