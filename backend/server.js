const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// =========================
// MongoDB Connection
// =========================

mongoose.connect(
  'mongodb+srv://meshramharsh19:Harsh1909@cojag.p4nxuuy.mongodb.net/survey?appName=Cojag',
  {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }
)
.then(() => {

  console.log("MongoDB Connected");

})
.catch(err => {

  console.error("Mongo Error:", err);

});

// ============================
// Banner Schema
// ============================

const bannerSchema = new mongoose.Schema({

  house_id: {
    type: String,
    required: true
  },

  title: String,

  type: String,

  date: String,

  createdAt: {
    type: Date,
    default: Date.now
  }

});

const Banner =
  mongoose.model(
    "Banner",
    bannerSchema
  );

// =========================
// Create HTTP Server
// =========================

const server = http.createServer(app);

// =========================
// Socket Setup
// =========================

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

require("./socket")(io);

// =========================
// Save Banner API
// =========================

app.post("/api/add-banner", async (req, res) => {

  try {

    console.log("Banner API called");
     console.log("Incoming body:", req.body);
    const banner =
      new Banner(req.body);

    await banner.save();

    console.log(
      "Banner saved to Mongo:",
      banner
    );

    res.json({
      message: "Banner saved successfully"
    });

  }
  catch(error) {

    console.error(error);

    res.status(500).json({
      message: "Error saving banner"
    });

  }

});

// =========================
// Get Banners API
// =========================

app.get("/api/banners/:houseId", async (req, res) => {

  try {

    const houseId =
      req.params.houseId;

    const banners =
      await Banner.find({
        house_id: houseId
      });

    res.json(banners);

  }
  catch(error) {

    console.error(error);

    res.status(500).json({
      message: "Error fetching banners"
    });

  }

});

// =========================
// Serve Static Files
// =========================

app.use(express.static(
  path.join(__dirname)
));

// =========================
// Start Server
// =========================

server.listen(4000, () => {

  console.log(
    "Server running at http://localhost:4000"
  );

});