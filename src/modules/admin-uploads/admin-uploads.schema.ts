import { z } from "zod";

/** File types the product-images bucket accepts (see migration 0003), with their extensions. */
export const IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

export type ImageContentType = keyof typeof IMAGE_EXTENSIONS;

export const createImageUploadSchema = z.strictObject({
  contentType: z.enum(Object.keys(IMAGE_EXTENSIONS) as [ImageContentType, ...ImageContentType[]], {
    error: "Upload a JPEG, PNG, WebP or AVIF image",
  }),
});

export type CreateImageUploadInput = z.infer<typeof createImageUploadSchema>;
