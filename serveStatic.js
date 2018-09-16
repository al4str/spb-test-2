#!/usr/bin/env node

const path = require('path');
const express = require('express');

const port = process.env.PORT || 5000;
const server = express();
server.use(express.static('docs', { index: false }));
server.get('/', async (req, res) => {
  const indexFilePath = path.join(process.cwd(), 'docs', 'index.html');
  res.sendFile(indexFilePath);
});
server.listen(port, () => console.info(`localhost:${port}`));
