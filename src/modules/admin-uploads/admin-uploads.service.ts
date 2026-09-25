import { randomUUID } from "node:crypto";
import { IMAGE_EXTENSIONS, type CreateImageUploadInput } from "./admin-uploads.schema.js";
import { PRODUCT_IMAGES_BUCKET, productImagesStorage } from "./admin-uploads.storage.js";

// Supabase signed upload URLs are valid for two hours.
const SIGNED_UPLOAD_TTL_SECONDS = 2 * 60 * 60;

export type ImageUploadTicket = {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
  /** Where the image will be served once uploaded; save this as the product's imageUrl. */
  publicUrl: string;
  expiresInSeconds: number;
};

export const adminUploadsService = {
  /**
   * Issues a one-off URL the admin's browser uploads the file to directly, so image bytes
   * never pass through this server. Storage enforces the bucket's size and type limits.
   */
  async createProductImageUpload({ contentType }: CreateImageUploadInput): Promise<ImageUploadTicket> {
    // Random names: no collisions, and nothing guessable about unpublished products.
    const path = `products/${randomUUID()}.${IMAGE_EXTENSIONS[contentType]}`;
    const upload = await productImagesStorage.createSignedUpload(path);

    return {
      bucket: PRODUCT_IMAGES_BUCKET,
      ...upload,
      publicUrl: productImagesStorage.publicUrl(upload.path),
      expiresInSeconds: SIGNED_UPLOAD_TTL_SECONDS,
    };
  },
};
