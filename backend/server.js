const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  }
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("newSurveySaved", (data) => {
    console.log("New survey received:", data);

    io.emit("polygonAdded", data);
console.log("Broadcasted polygonAdded");


    
  });

});
server.listen(3000, () => {
  console.log("WebSocket server running on :3000");
});
