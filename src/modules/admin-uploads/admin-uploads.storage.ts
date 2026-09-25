import { supabase } from "../../lib/supabase.js";

export const PRODUCT_IMAGES_BUCKET = "product-images";

export type SignedUpload = {
  path: string;
  token: string;
  signedUrl: string;
};

// Thin wrapper over Supabase Storage, the storage counterpart of a repository.
export const productImagesStorage = {
  async createSignedUpload(path: string): Promise<SignedUpload> {
    const { data, error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return data;
  },

  publicUrl(path: string): string {
    return supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
  },
};
