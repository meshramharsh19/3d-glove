const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Serve frontend files
app.use(express.static(path.join(__dirname)));

// Attach socket logic
require("./socket")(io);

server.listen(3000, () => console.log("Server running at http://localhost:3000"));
