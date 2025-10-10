const express = require('express');
const server = express();

// Replace this with your secret token
const SECRET_TOKEN = "TheEgyptianCat252025";

server.get('/ping', (req, res) => {
  const token = req.query.token;
  if (token !== SECRET_TOKEN) {
    return res.status(403).send('❌ Not allowed');
  }
  res.send('✅ Bot is alive!');
});

function keepAlive() {
  server.listen(3000, () => {
    console.log('🌐 Keep-alive server is running!');
  });
}

module.exports = keepAlive;
