import { supabase } from "../../lib/supabase.js";
import type { Brand } from "./brands.types.js";

export const brandsRepository = {
  async findAll(): Promise<Brand[]> {
    const { data } = await supabase.from("brands").select("id, name, slug").order("name").throwOnError();
    return data;
  },
};
