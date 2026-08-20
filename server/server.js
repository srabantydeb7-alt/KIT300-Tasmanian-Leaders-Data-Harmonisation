const { createApp } = require("./app");

const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || "127.0.0.1";
const app = createApp();

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}/api/health`);
  });
}

module.exports = app;
