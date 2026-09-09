import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * Photo uploads go through Server Actions, and the default cap is 1 MB —
       * smaller than most phone photos, so every real upload failed with a 413.
       *
       * Vehicle images and branding artwork are capped at 8 MB by
       * MAX_IMAGE_BYTES; the extra headroom covers the multipart boundaries and
       * part headers that ride along with the file itself.
       */
      bodySizeLimit: "9mb",
    },
  },
};

export default nextConfig;
