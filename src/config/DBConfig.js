const mongoose = require("mongoose");
module.exports = async function connectDB() {
  const uri = process.env.MONGO_URL || "mongodb://localhost:27017/encryption_db";
  await mongoose.connect(uri);
  console.log("Mongodb connected");
};
