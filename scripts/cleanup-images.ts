import { supabase } from "../src/lib/supabase.js";
import { PRODUCT_IMAGES_BUCKET } from "../src/modules/admin-uploads/admin-uploads.storage.js";

// Preview by default. Run with --delete after checking the list; never runs at API startup.
const remove = process.argv.includes("--delete");
const bucket = supabase.storage.from(PRODUCT_IMAGES_BUCKET);
const cutoff = Date.now() - 7 * 24 * 60 * 60_000;
let inspected = 0;
const candidates: string[] = [];
for (let offset = 0; ; offset += 100) {
  const { data, error } = await bucket.list("products", { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
  if (error) throw error;
  for (const file of data) {
    inspected++;
    if (!file.id || !file.created_at || Date.parse(file.created_at) >= cutoff || !/^[a-f0-9-]+\.(jpg|png|webp|avif)$/.test(file.name)) continue;
    const path = `products/${file.name}`;
    const url = bucket.getPublicUrl(path).data.publicUrl;
    const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).like("image_url", `${url}%`).throwOnError();
    const { count: pending } = await supabase.from("orders").select("id", { count: "exact", head: true })
      .eq("status", "pending").contains("checkout_images", [url]).throwOnError();
    if (count === 0 && pending === 0) candidates.push(path);
  }
  if (data.length < 100) break;
}
console.log(JSON.stringify({ mode: remove ? "delete" : "preview", inspected, candidates }, null, 2));
if (remove) {
  for (const path of candidates) {
    // Check again immediately before deletion, including hidden products.
    const url = bucket.getPublicUrl(path).data.publicUrl;
    const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).like("image_url", `${url}%`).throwOnError();
    const { count: pending } = await supabase.from("orders").select("id", { count: "exact", head: true })
      .eq("status", "pending").contains("checkout_images", [url]).throwOnError();
    if (count !== 0 || pending !== 0) continue;
    const { error } = await bucket.remove([path]);
    if (error) throw error;
  }
}
