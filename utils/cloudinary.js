import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Support single CLOUDINARY_URL (e.g. cloudinary://API_KEY:API_SECRET@CLOUD_NAME) or separate env vars
if (process.env.CLOUDINARY_URL) {
  cloudinary.config(); // SDK reads CLOUDINARY_URL from process.env
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export const uploadToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto', // Automatically detect image, video, or raw
        folder: 'chat-app', // Optional folder in Cloudinary
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    file.stream.pipe(uploadStream);
  });
};

export const deleteFromCloudinary = async (publicId) => {
  const result = await cloudinary.uploader.destroy(publicId);
  return result;
};

export default cloudinary;

