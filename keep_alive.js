const express = require('express');
const server = express();

// Replace this with your own secret token (must match Google Apps Script)
const SECRET_TOKEN = "TheEgyptianCat252025";

server.all('/', (req, res) => {
  res.send('✅ Bot is alive!');
});

// Ping endpoint — secured with token
server.get('/ping', (req, res) => {
  const token = req.query.token;
  if (token === SECRET_TOKEN) {
    console.log("Ping received from Apps Script ✅");
    return res.status(200).send("Pong!");
  } else {
    console.warn("Unauthorized ping attempt 🚫");
    return res.status(403).send("Not allowed");
  }
});

function keepAlive() {
  server.listen(3000, () => {
    console.log('🌐 Server is ready — keep-alive is active!');
  });
}

module.exports = keepAlive;
