const express = require("express");
const cors = require("cors");
const exportRoutes = require("./Routes/export");
const overviewRoutes = require("./Routes/overview");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());
app.use("/api/overview", overviewRoutes);
app.use("/api/export", exportRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "KIT300 Data Harmonisation API is running",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
