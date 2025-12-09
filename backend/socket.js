module.exports = function (io) {

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Send initial hello message
    socket.emit("initData", { msg: "Welcome!" });

    // Received position update from client
    socket.on("positionUpdate", (data) => {
      console.log("Position:", data);

      // Send this update to all OTHER clients
      socket.broadcast.emit("update", {
        id: socket.id,
        position: data,
      });
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);

      // Tell others that this client left
      socket.broadcast.emit("peerLeft", { id: socket.id });
    });
  });

};
