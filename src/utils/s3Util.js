const {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { randomUUID } = require("crypto");
const path = require("path");
const logger = require("./logger");

// If AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not provided,
// the SDK will automatically use the EC2 IAM Role.
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    ...(process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
        ? {
              credentials: {
                  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
              }
          }
        : {})
});

/**
 * Upload file to S3
 */
async function uploadFile(file, folder = "uploads") {

    if (!file) {
        throw new Error("File is required.");
    }

    try {

        const extension = path.extname(file.originalname);

        const fileKey = `${folder}/${randomUUID()}${extension}`;

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileKey,
            Body: file.buffer,
            ContentType: file.mimetype
        });

        await s3Client.send(command);

        logger.info("S3 Upload Success", {
            bucket: process.env.AWS_S3_BUCKET,
            key: fileKey
        });

        return {
            success: true,
            key: fileKey
        };

    } catch (error) {

        logger.error("S3 Upload Error", {
            error: error.message
        });

        throw error;
    }
}

/**
 * Delete file from S3
 */
async function deleteFile(fileKey) {

    if (!fileKey) {
        return;
    }

    try {

        const command = new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileKey
        });

        await s3Client.send(command);

        logger.info("S3 File Deleted", {
            key: fileKey
        });

    } catch (error) {

        logger.error("Delete File Error", {
            error: error.message
        });

        throw error;
    }

}

/**
 * Generate Signed URL
 */
async function getPreSignedUrl(fileKey, expiresIn = 3600) {

    if (!fileKey) {
        return null;
    }

    const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileKey,
        ResponseContentDisposition: "inline"
    });

    return await getSignedUrl(
        s3Client,
        command,
        {
            expiresIn
        }
    );

}

module.exports = {
    uploadFile,
    deleteFile,
    getPreSignedUrl
};