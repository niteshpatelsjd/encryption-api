const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const logger = require("./logger"); // ✅ import logger

// const uploadPath = path.join(__dirname, "..", "uploads");
// const getPath = "/uploads/"; // URL prefix for served files

const uploadPath = "/home/camel/files"; // absolute server path
const getPath = "http://13.61.199.168/camel/files/"; // URL prefix served by Nginx


// Ensure upload folder exists
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
  logger.info(`📂 Created uploads directory at: ${uploadPath}`);
}

/**
 * Upload a file from multer
 */
async function uploadFile(file) {
  try {
    if (!file) {
      logger.warn("⚠️ No file provided to uploadFile()");
      return null;
    }

    const ext = path.extname(file.originalname);
    const fileName = crypto.randomUUID() + ext;
    const filePath = path.join(uploadPath, fileName);

    // If file.buffer exists (memoryStorage)
    if (file.buffer) {
      fs.writeFileSync(filePath, file.buffer);
    } 
    // If file.path exists (diskStorage)
    else if (file.path) {
      fs.copyFileSync(file.path, filePath);
    } else {
      throw new Error("Invalid file object: missing buffer or path");
    }

    const fileUrl = getPath + fileName;

    logger.info(`✅ File uploaded: ${file.originalname} → ${fileUrl}`);
    return fileUrl;
  } catch (err) {
    logger.error("❌ uploadFile error", { error: err });
    throw err;
  }
}

/**
 * Download an image from URL and save locally
 */
async function downloadImage(imageUrl) {
  try {
    const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
    let ext = "jpg";

    const contentType = response.headers["content-type"];
    if (contentType) {
      switch (contentType) {
        case "image/jpeg":
          ext = "jpg";
          break;
        case "image/png":
          ext = "png";
          break;
        case "image/gif":
          ext = "gif";
          break;
        case "image/webp":
          ext = "webp";
          break;
        case "image/bmp":
          ext = "bmp";
          break;
        case "image/svg+xml":
          ext = "svg";
          break;
        default:
          ext = "jpg";
      }
    }

    const fileName = crypto.randomUUID() + "." + ext;
    const filePath = path.join(uploadPath, fileName);
    fs.writeFileSync(filePath, response.data);
    const fileUrl = getPath + fileName;

    logger.info(`⬇️ Image downloaded from ${imageUrl} → ${fileUrl}`);
    return fileUrl;
  } catch (err) {
    logger.error("❌ downloadImage error", { error: err, url: imageUrl });
    return null;
  }
}


module.exports = {
  uploadFile,
  downloadImage,
};
